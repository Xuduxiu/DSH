#!oxford-python
# 两层扫描示例：启用后点「计划预览」查看六次采样的展开顺序。
# 默认只读已选通道；温度和磁场变量不会自动改变仪器设定。
# 如需实际扫描，请先核对当前平台的设备编号、模式、单位、速率及稳定条件。
for temperature in [4, 6]:
    # set_value(0, "Temperature", temperature, 1)
    for field in [0, 0.05, 0.1]:
        # set_value(0, "Magnet", field, 0.01)
        hold(1)
