let initialized = false;

function setupWrtc() {
  if (initialized) return;
  initialized = true;

  try {
    const wrtc = require("@koush/wrtc");
    global.RTCPeerConnection = wrtc.RTCPeerConnection;
    global.RTCSessionDescription = wrtc.RTCSessionDescription;
    global.RTCIceCandidate = wrtc.RTCIceCandidate;
    console.log("[WebRTC] Initialized @koush/wrtc");
  } catch (e1) {
    try {
      const wrtc = require("wrtc");
      global.RTCPeerConnection = wrtc.RTCPeerConnection;
      global.RTCSessionDescription = wrtc.RTCSessionDescription;
      global.RTCIceCandidate = wrtc.RTCIceCandidate;
      console.log("[WebRTC] Initialized wrtc");
    } catch (e2) {
      console.error("[WebRTC] No WebRTC implementation found. Install @koush/wrtc or wrtc.");
      throw new Error("No WebRTC implementation available");
    }
  }
}

setupWrtc();
module.exports = { setupWrtc };
