using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Sunzh.Oxford.Device;
using Sunzh.Oxford.Measure;
using Sunzh.Oxford.Task;
using Sunzh.Oxford.UI.XLab;

namespace Sunzh.Oxford
{
    // Explicit opt-in: stdin/stdout of the DSH-launched child only. All UI
    // commands run on the original WinForms thread and use its acquisition gates.
    public partial class MainWindow
    {
        internal void StartDshBridge()
        {
            System.Threading.Tasks.Task.Run(() => {
                var json=new JavaScriptSerializer { MaxJsonLength=440000, RecursionLimit=8 };
                using(var input=new StreamReader(Console.OpenStandardInput(),new UTF8Encoding(false,true)))
                using(var output=new StreamWriter(Console.OpenStandardOutput(),new UTF8Encoding(false)) { AutoFlush=true })
                {
                    try {
                        string line;
                        while((line=input.ReadLine())!=null && !closingInProgress)
                        {
                            if(line.Length>440000) break;
                            int id=0; object reply;
                            try {
                                var query=json.Deserialize<Dictionary<string,object>>(line);
                                object value;
                                if(!query.TryGetValue("id",out value)||!(value is int)) break;
                                id=(int)value;
                                string action=query.TryGetValue("action",out value)?value as string:null;
                                string source=query.TryGetValue("source",out value)?value as string:null;
                                string theme=query.TryGetValue("theme",out value)?value as string:null;
                                if(closingInProgress || IsDisposed) break;
                                object status=Invoke(new Func<object>(()=>{ ApplyDshProtocol(theme); return DshRequest(action,source); }));
                                reply=new {protocol=1,id,status};
                            } catch(Exception e) {reply=new {protocol=1,id,error=e.GetBaseException().Message};}
                            output.WriteLine(json.Serialize(reply));
                        }
                    } catch(IOException) { /* Native controls remain available if DSH exits. */ }
                    catch(ObjectDisposedException) {}
                    finally {
                        if(!closingInProgress && IsHandleCreated && !IsDisposed)
                            try { BeginInvoke(new Action(DetachDshProtocol)); } catch(InvalidOperationException) {}
                    }
                }
            });
        }
        private string dshProtocol;
        private void ApplyDshProtocol(string id)
        {
            if(id==dshProtocol) return;
            var palette=XLabPalette.ForDsh(id);
            // Older hosts send no theme. Ignore missing/unrecognized values
            // rather than disrupting an in-flight measurement command.
            if(palette==null) return;
            XLabTheme.HostPalette=palette;
            ApplyXLabTheme(palette.IsDark,false);
            dshProtocol=id;
            themeButton.Enabled=false;
            themeButton.Text="DSH · "+palette.Name;
        }
        private void DetachDshProtocol()
        {
            if(dshProtocol==null || IsDisposed || closingInProgress)return;
            XLabTheme.HostPalette=null;
            dshProtocol=null;
            // Keep the current picture until the operator switches themes.
            themeButton.Enabled=true;
            themeButton.Text=XLabTheme.Current.IsDark?"◐  浅色主题":"◑  深色主题";
        }
        private static string DshSource(string text)
        {
            if(String.IsNullOrWhiteSpace(text) || Encoding.UTF8.GetByteCount(text)>65536)
                throw new InvalidOperationException("缺少有效的 Python 测量计划。");
            string s=text.TrimStart('\uFEFF').Replace("\r\n","\n").Replace('\r','\n');
            return HasPythonMarker(s)?s:PythonMarker+"\n"+s;
        }
        private object DshRequest(string action,string source)
        {
            if(closingInProgress) throw new InvalidOperationException("Oxford 正在退出。");
            if(action=="arm") {
                if(isMeasuring || isFastMeasuring || !InstrumentPanelActionAllowed() ||
                   (measurementWorker!=null && !measurementWorker.IsCompleted)) throw new InvalidOperationException("请先停止采集或等待仪器操作完成。");
                string plan=DshSource(source);
                if(!ConfirmReplaceScript()) throw new InvalidOperationException("已取消替换原生脚本。");
                if(programArmed) SwitchArmState();
                SetScriptDocument(plan,null,"DSH 测量计划.py");
                SwitchArmState();
            } else if(action=="start") {
                if(DeviceManager.OfflineMode || isMeasuring || !programArmed || !TaskManager.IsPythonPlan)
                    throw new InvalidOperationException("请先联机、选择测量通道并启用 Python 计划。");
                if(DshSource(source)!=DshSource(Program_WorkZone.NRichTextBox.Text))
                    throw new InvalidOperationException("脚本已修改；请重新启用当前计划。");
                if(!MainMeasure_Start.Enabled || !InstrumentPanelActionAllowed())
                    throw new InvalidOperationException("当前不可启动采集，请检查原生窗口。");
                Activate();
                MainMeasure_Start_Click(this,EventArgs.Empty);
                if(!isMeasuring)throw new InvalidOperationException("采集没有开始，请检查原生窗口的保存路径和设备状态。");
            } else if(action=="pause" || action=="resume") {
                if(!isMeasuring)throw new InvalidOperationException("当前没有进行中的采集。");
                if((action=="pause")!=isPausing)MainMeasure_Pause_Click(this,EventArgs.Empty);
            } else if(action=="stop") {
                if(isMeasuring)MainMeasure_Start_Click(this,EventArgs.Empty);
            } else if(action=="close") {
                if(isMeasuring || isFastMeasuring || programDirty || (measurementWorker!=null&&!measurementWorker.IsCompleted))
                    throw new InvalidOperationException("请在原生窗口停止采集、保存修改后退出。");
                BeginInvoke(new Action(Close));
            } else if(action=="focus") {
                if(WindowState==FormWindowState.Minimized)WindowState=FormWindowState.Normal;
                Activate();
            } else if(action!="status")throw new InvalidOperationException("未知的 Oxford 操作。");

            var devices=new List<object>();
            var main=DeviceManager.mainDevice;
            if(DeviceManager.ConfiguredMainDeviceType!=MainDeviceType.Null || main!=null)
                devices.Add(new {id=0,name=main==null?DeviceManager.MainDeviceTypeToName(DeviceManager.ConfiguredMainDeviceType):main.name,
                    type=DeviceManager.ConfiguredMainDeviceType.ToString(),connected=!DeviceManager.OfflineMode&&main!=null&&main.isConnected});
            foreach(var d in DeviceManager.devices)
                devices.Add(new {id=d.id,name=d.name,type=d.type.ToString(),connected=!DeviceManager.OfflineMode&&d.isConnected});
            var latest=new List<object>();
            if(!DeviceManager.OfflineMode && lastSampleUtc.HasValue && isSaving) {
                var titles=measuredParamters.Distinct().Take(128).ToList();
                var row=Data.GetRowData(titles);
                if(row!=null)for(int i=0;i<row.Count;i++)
                    if(!Double.IsNaN(row[i])&&!Double.IsInfinity(row[i]))latest.Add(new {label=titles[i],value=row[i]});
            }
            return new {mode=DeviceManager.OfflineMode?"offline":"online",theme=dshProtocol,measuring=isMeasuring,paused=isMeasuring&&isPausing,
                armed=programArmed&&TaskManager.IsPythonPlan,devices,latest,sampleUtc=lastSampleUtc.HasValue?lastSampleUtc.Value.ToString("o"):null,
                message=lastFault??""};
        }
    }
}
