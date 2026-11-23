// Adds Firebase (needed for push notifications on Android) once google-services.json
// is in the project root — see README "Push notifications". Everything else is in app.json.
const fs = require("fs");
const path = require("path");

module.exports = ({ config }) => {
  const firebase = path.join(__dirname, "google-services.json");
  return {
    ...config,
    android: {
      ...config.android,
      ...(fs.existsSync(firebase) && { googleServicesFile: "./google-services.json" }),
    },
  };
};
