"""Compile an Oxford measurement plan from stdin; stdout is one UTF-8 JSON object.

The Python parser supplies syntax, indentation and source locations. Only the
small collection of operations below is interpreted. User code is never
imported or executed, and this module has no connection to the instruments.
"""
import ast
import json
import math
import operator
import re
import sys


MAX_SOURCE = 65536
MAX_STEPS = 10000
MAX_SEQUENCE = 10000
MAX_WORK = 200000
MAX_ABS = 10**12
MAX_TEXT = 120
ACTIONS = {"set_value", "sampling", "hold", "delay", "save", "wait_for"}
SEQUENCES = {"range", "linspace"}
BINARY = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul,
          ast.Div: operator.truediv, ast.FloorDiv: operator.floordiv, ast.Mod: operator.mod}
COMPARE = {ast.Eq: operator.eq, ast.NotEq: operator.ne, ast.Lt: operator.lt,
           ast.LtE: operator.le, ast.Gt: operator.gt, ast.GtE: operator.ge}
OPS = (ast.Add, ast.Sub, ast.Mult, ast.Div, ast.FloorDiv, ast.Mod, ast.UAdd,
       ast.USub, ast.Not, ast.And, ast.Or, ast.Eq, ast.NotEq, ast.Lt, ast.LtE,
       ast.Gt, ast.GtE, ast.Load, ast.Store)
NODES = (ast.Module, ast.Assign, ast.Name, ast.Constant, ast.Tuple, ast.List,
         ast.BinOp, ast.UnaryOp, ast.BoolOp, ast.Compare, ast.Call, ast.Expr,
         ast.For, ast.If, ast.Break, ast.Continue, ast.Pass, ast.JoinedStr,
         ast.FormattedValue) + OPS
MODE = re.compile(r"[^\W\d][\w.-]{0,63}\Z", re.UNICODE)
FILENAME = re.compile(r"[\w-][\w.-]{0,119}\Z", re.UNICODE)
RESERVED = re.compile(r"(?i)(?:CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])(?:\.|$)")
# Keep width and precision bounded before passing anything to number formatting.
FORMAT = re.compile(r"(?:0?(?:[1-9]|[12][0-9]|3[0-2]))?(?:\.(?:[0-9]|1[0-2]))?[defg]\Z")


class PlanError(ValueError):
    def __init__(self, line, message):
        super().__init__(message)
        self.line = max(1, line or 1)


def reject(node, message):
    raise PlanError(getattr(node, "lineno", 1), message)


def number(v, node):
    if type(v) not in (int, float) or abs(v) > MAX_ABS or not math.isfinite(v):
        reject(node, "需要绝对值不超过 10¹² 的有限数值")
    # The magnitude check precedes conversion so arbitrary Python integers do
    # not escape as either intermediate operands or serialized device values.
    return v


def integer(v, node, lo, hi):
    if type(v) is not int or not lo <= v <= hi:
        reject(node, "需要范围 {} 到 {} 内的整数".format(lo, hi))
    return v


def valid_target(node):
    if not isinstance(node, ast.Name) or node.id.startswith("_") or node.id in ACTIONS | SEQUENCES:
        reject(node, "变量名不能是保留名称，且不支持多重赋值或属性赋值")


def validate(tree):
    # Walk all branches, including empty loops and branches never selected.
    # ast.parse does not reject 'break' outside a loop, so check scope here.
    work = [(tree, 0, 0, None)]
    seen = 0
    while work:
        n, depth, loops, parent = work.pop()
        seen += 1
        if depth > 40 or seen > 12000 or loops > 16:
            reject(n, "脚本语法或嵌套规模超限")
        if not isinstance(n, NODES):
            reject(n, "不支持的 Python 语法：" + type(n).__name__)
        if isinstance(n, ast.Assign):
            if len(n.targets) != 1:
                reject(n, "仅支持单变量赋值")
            valid_target(n.targets[0])
        elif isinstance(n, ast.For):
            valid_target(n.target)
            if n.orelse:
                reject(n, "不支持 for ... else")
        elif isinstance(n, (ast.Break, ast.Continue)) and not loops:
            reject(n, "break / continue 只能写在循环内")
        elif isinstance(n, ast.Call):
            if not isinstance(n.func, ast.Name) or n.keywords:
                reject(n, "函数调用须使用内置名称与位置参数")
            name = n.func.id
            if name not in (ACTIONS if isinstance(parent, ast.Expr) else SEQUENCES):
                reject(n, "不支持在此处调用：" + name)
            arity = {"set_value": (2, 18), "sampling": (1, 1), "hold": (1, 1), "delay": (1, 1),
                     "save": (1, 1), "wait_for": (4, 4), "range": (1, 3), "linspace": (3, 3)}
            lo, hi = arity[name]
            if not lo <= len(n.args) <= hi:
                reject(n, name + " 的参数个数不正确")
        elif isinstance(n, ast.Expr) and not isinstance(n.value, ast.Call):
            reject(n, "独立语句应为测量动作")
        elif isinstance(n, ast.Constant):
            v = n.value
            if type(v) in (float, int):
                number(v, n)
            elif type(v) is str:
                if len(v) > MAX_TEXT:
                    reject(n, "字符串过长")
            elif v is not None and type(v) is not bool:
                reject(n, "不支持此常量类型")
        elif isinstance(n, ast.FormattedValue):
            spec = n.format_spec
            if n.conversion != -1 or (spec is not None and not (
                isinstance(spec, ast.JoinedStr) and len(spec.values) == 1 and
                isinstance(spec.values[0], ast.Constant) and type(spec.values[0].value) is str
                and FORMAT.fullmatch(spec.values[0].value)
            )):
                reject(n, "f-string 仅支持数值及简短的静态数值格式，如 :.2f")
        for child in reversed(list(ast.iter_child_nodes(n))):
            work.append((child, depth + 1, loops + int(isinstance(n, ast.For)), n))


class Compiler:
    def __init__(self):
        self.env = {}
        self.steps = []
        self.work = 0

    def charge(self, n, cost=1):
        self.work += cost
        if self.work > MAX_WORK:
            reject(n, "展开计算超过 200,000 步，请拆分扫描")

    def sequence_cost(self, n, length):
        if length > MAX_SEQUENCE:
            reject(n, "序列最多 10,000 项")
        self.charge(n, length)

    def value(self, n):
        self.charge(n)
        if isinstance(n, ast.Constant):
            return n.value
        if isinstance(n, ast.Name):
            if n.id not in self.env:
                reject(n, "未定义变量：" + n.id)
            return self.env[n.id]
        if isinstance(n, (ast.List, ast.Tuple)):
            self.sequence_cost(n, len(n.elts))
            return tuple(number(self.value(x), x) for x in n.elts)
        if isinstance(n, ast.Call):
            args = [self.value(arg) for arg in n.args]
            if n.func.id == "range":
                for v in args:
                    integer(v, n, -MAX_ABS, MAX_ABS)
                if len(args) == 3 and args[2] == 0:
                    reject(n, "range 的步长不能为零")
                r = range(*args)
                if len(r) > MAX_SEQUENCE:
                    reject(n, "range 最多 10,000 项")
                return r
            a, b = (number(v, n) for v in args[:2])
            count = integer(args[2], n, 1, MAX_SEQUENCE)
            self.sequence_cost(n, count)
            if count == 1:
                return (a,)
            return tuple(a + (b - a) * (i / (count - 1)) for i in range(count - 1)) + (b,)
        if isinstance(n, ast.UnaryOp):
            v = self.value(n.operand)
            if isinstance(n.op, ast.Not):
                return not v
            v = number(v, n)
            return v if isinstance(n.op, ast.UAdd) else -v
        if isinstance(n, ast.BinOp):
            a = number(self.value(n.left), n)
            b = number(self.value(n.right), n)
            try:
                return number(BINARY[type(n.op)](a, b), n)
            except ArithmeticError:
                reject(n, "除零或数值运算超限")
        if isinstance(n, ast.Compare):
            a = self.value(n.left)
            for op, right in zip(n.ops, n.comparators):
                b = self.value(right)
                # Comparing nested sequences can perform unmetered linear work.
                if isinstance(a, (tuple, range)) or isinstance(b, (tuple, range)):
                    reject(n, "比较只支持标量")
                try:
                    if not COMPARE[type(op)](a, b):
                        return False
                except TypeError:
                    reject(n, "比较运算两侧类型不兼容")
                a = b
            return True
        if isinstance(n, ast.BoolOp):
            for expr in n.values:
                v = self.value(expr)
                if isinstance(n.op, ast.And) and not v or isinstance(n.op, ast.Or) and v:
                    return v
            return v
        if isinstance(n, ast.JoinedStr):
            parts = []
            for item in n.values:
                if isinstance(item, ast.Constant):
                    parts.append(item.value)
                else:
                    v = number(self.value(item.value), item)
                    spec = item.format_spec.values[0].value if item.format_spec is not None else ""
                    try:
                        parts.append(format(v, spec))
                    except ValueError:
                        reject(item, "f-string 格式与数值不兼容")
            s = "".join(parts)
            if len(s) > MAX_TEXT:
                reject(n, "格式化字符串过长")
            return s
        reject(n, "不支持此表达式")

    def action(self, n):
        name = n.func.id
        args = [self.value(x) for x in n.args]
        if name in ("set_value", "wait_for"):
            dev, mode = args[:2]
            integer(dev, n, 0, 2147483647)
            if type(mode) is not str or MODE.fullmatch(mode) is None:
                reject(n, "仪器参数名须为单个名称（字母、数字、下划线、点或连字符）")
            if name == "set_value":
                command = " ".join(["SET", str(dev), mode] + [str(number(v, n)) for v in args[2:]])
            else:
                op = args[2]
                if type(op) is not str or op not in ("<", "<=", "=", "==", "!=", ">=", ">"):
                    reject(n, "wait_for 比较符无效")
                command = "WHEN {} {} {} {}".format(dev, mode, "=" if op == "==" else op, number(args[3], n))
        elif name == "save":
            path = args[0]
            if path is None:
                path = "null"
            elif (type(path) is not str or not FILENAME.fullmatch(path) or path.endswith(".") or
                  path.casefold() == "null" or RESERVED.match(path)):
                reject(n, "save 需要不含路径、空格或保留名的文件基名；用 None 停止保存")
            command = "SAVE " + path
        elif name == "hold":
            count = integer(args[0], n, 0, 2147483646)
            command = "HOLD " + str(count)
        else:
            seconds = number(args[0], n)
            if name == "sampling":
                if not 0.001 <= seconds <= 2147483:
                    reject(n, "采样周期应在 0.001 到 2147483 秒之间")
                command = "SET sampling " + str(seconds)
            else:
                if seconds < 0:
                    reject(n, "等待时间不能为负")
                command = "DELAY " + str(seconds)
        if len(self.steps) >= MAX_STEPS:
            reject(n, "计划超过 10,000 个测量动作")
        self.steps.append({"line": n.lineno, "command": command})

    def block(self, statements):
        for n in statements:
            self.charge(n)
            if isinstance(n, ast.Assign):
                self.env[n.targets[0].id] = self.value(n.value)
            elif isinstance(n, ast.Expr):
                self.action(n.value)
            elif isinstance(n, ast.For):
                seq = self.value(n.iter)
                if not isinstance(seq, (range, tuple)):
                    reject(n, "for 需要数值列表、元组、range 或 linspace")
                for value in seq:
                    self.charge(n)
                    self.env[n.target.id] = value
                    signal = self.block(n.body)
                    if signal == "break":
                        break
                    # An inner continue exits its block; this loop advances.
            elif isinstance(n, ast.If):
                signal = self.block(n.body if self.value(n.test) else n.orelse)
                if signal:
                    return signal
            elif isinstance(n, ast.Break):
                return "break"
            elif isinstance(n, ast.Continue):
                return "continue"


def compile_plan(source):
    if len(source.encode("utf-8")) > MAX_SOURCE:
        raise PlanError(1, "源码最多 64 KiB")
    try:
        tree = ast.parse(source, filename="<Oxford>", mode="exec")
    except SyntaxError as e:
        raise PlanError(e.lineno, "Python 语法错误：" + e.msg) from None
    except (RecursionError, ValueError):
        raise PlanError(1, "源码包含非法字符或语法树过深") from None
    validate(tree)
    compiler = Compiler()
    compiler.block(tree.body)
    if not compiler.steps:
        raise PlanError(1, "计划中没有要执行的测量动作")
    return compiler.steps


def main():
    try:
        raw = sys.stdin.buffer.read(MAX_SOURCE + 1)
        if len(raw) > MAX_SOURCE:
            raise PlanError(1, "源码最多 64 KiB")
        result = {"steps": compile_plan(raw.decode("utf-8-sig"))}
        status = 0
    except (UnicodeDecodeError, PlanError) as exc:
        failed_line = getattr(exc, "line", 1)
        result = {"error": str(exc) if isinstance(exc, PlanError) else "脚本必须使用 UTF-8",
                  "line": failed_line}
        status = 1
    sys.stdout.buffer.write(json.dumps(result, ensure_ascii=True, separators=(",", ":")).encode("ascii") + b"\n")
    return status


if __name__ == "__main__":
    sys.exit(main())
