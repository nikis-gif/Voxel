(function () {
  "use strict";

  var isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

  // Set this after the backend is deployed (ex.: https://voxel-support-api.onrender.com/api/support).
  var productionSupportApiUrl = "";

  window.VOXEL_CONFIG = Object.freeze({
    supportApiUrl: isLocal ? "http://localhost:3000/api/support" : productionSupportApiUrl
  });
})();
