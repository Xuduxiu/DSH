#!oxford-python
# PPMS 形式的二维计划，用于演示展开顺序。预览不触发磁体或采集。
# 这里不设稳定判据；实际测量请先核对平台、单位、速率，加入适用的等待条件。
for temperature in (4, 6):
    set_value(0, "Temperature", temperature, 1)
    for field in (0, 10, 20):
        set_value(0, "Magnet", field, 1)
        hold(1)
