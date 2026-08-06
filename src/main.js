import { bootstrap } from "./app/bootstrap.js";

bootstrap().catch((error) => {
  console.error("Mouse Strike bootstrap failed", error);
  if (typeof wx !== "undefined" && wx.showModal) {
    wx.showModal({
      title: "启动失败",
      content: "当前微信版本或设备暂不支持游戏渲染，请更新微信后重新打开。",
      showCancel: false,
    });
  }
});
