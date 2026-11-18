// 云函数调用封装 + 通用错误提示
function call(name, data) {
  return wx.cloud.callFunction({ name: name, data: data || {} }).then(function (res) {
    const r = res && res.result;
    if (r && r.ok === false) {
      const msg = r.msg || "操作失败";
      wx.showToast({ title: msg, icon: "none" });
      return Promise.reject(new Error(msg));
    }
    return r && r.data !== undefined ? r.data : r;
  }, function (err) {
    wx.showToast({ title: "云函数调用失败：" + (err.errMsg || err.message || err), icon: "none" });
    return Promise.reject(err);
  });
}

module.exports = { call };
