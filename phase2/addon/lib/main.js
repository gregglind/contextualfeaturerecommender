
"use strict";

const {Recommendation} = require("./recommendation");
const controller = require("./controller");
const {data} = require("sdk/self");
const {WindowTracker} = require("sdk/deprecated/window-utils");
const logger = require("./logger");
const self = require("./self");
self.init();

const recommFileAddress = "recommendations.json";

require("./presentation/splitpage").init();  //TODO: move somewhere more meaningful
require("./presentation/doorhanger").init();
require("./experiment").init();
require("./feature-report").init();
require("./timer").init();
require("./logger").init();
require("./debug").init();


exports.main = function(options, callbacks){

  console.log("Hello World! I am alive :)");

  if (!self.isInitialized)
    firstRun();

  logger.logLoad(options.loadReason);

  controller.init();
}

function firstRun(){
  controller.loadRecFile(recommFileAddress);
  
  logger.logFirstRun();
  self.setInitialized();
}

function periodicLog(elapsedTime){
  if (elapsedTime % 20 != 0) return;
  logger.logPeriodicSelfInfo(self.periodicInfo);
}

exports.onUnload = function(reason){
  console.log("unloading due to " + reason);
}



