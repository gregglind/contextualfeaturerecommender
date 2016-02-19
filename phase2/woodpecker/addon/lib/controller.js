/*! This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

"use strict";

const dh = require('./presentation/doorhanger');
const {setTimeout, clearTimeout, setInterval, clearInterval} = require("sdk/timers");
const {WindowTracker} = require("sdk/deprecated/window-utils");
const tabs = require('sdk/tabs');
const {getMostRecentBrowserWindow, isBrowser} = require("sdk/window/utils");
const unload = require("sdk/system/unload").when;
const {Cu, Cc, Ci} = require("chrome");
const {prefs} = require("sdk/simple-prefs");
const {URL} = require("sdk/url");
const windows = require("sdk/windows").browserWindows
const timer = require("./timer");
const {handleCmd} = require("./debug");
const {PersistentObject} = require("./utils");
const {countRecent, updateFrequencies} = require("./moment");
const events = require("sdk/system/events");
const {merge} = require("sdk/util/object");
const logger = require('./logger');

const momentDataAddress = "moment.data";

const momentData = PersistentObject("simplePref", {address: momentDataAddress});


const observerService = Cc["@mozilla.org/observer-service;1"]
                      .getService(Ci.nsIObserverService);

let idleObserver;

function init(){
  dh.init();

  handleCmd(debug.parseCmd);

  unload(unloadController);

  listener.init();

}

const listener = {
  init: function(){

      //initialize moments //TODO: first run

    for (let moment in listener.momentListeners){
      if (!momentData[moment]){
        momentData[moment] = {
          count: 0,
          frequency: 0,
          totalFrequency: 0,
          effCount: 0,
          effFrequency: 0,
          effTotalFrequency: 0,
          rEffCount: 0,
          rEffFrequency: 0,
          rates: [],
          timestamps: []
        };
      }
  }
    
    // start moment listeners
    for (let moment in this.momentListeners)
      this.momentListeners[moment]();


    timer.tickCallback(function(et){updateFrequencies()});

    updateFrequencies();

  }
}

//new tab does not capture opening a new tab by double clicking the area on the right of the tabs
//or opening a link in new tab

listener.momentListeners = {
  "*": function(){

  },

  "startup": function(){
    listener.moment("startup");
  },

  "tab-new": function(){
    listener.addEventListener("#cmd_newNavigatorTab", "command", function(e){
        console.log("tab-new");
        listener.moment("tab-new", {reject: true});
      });
  },

  "active-tab-hostname-progress": function(){
    tabs.on("ready", function(tab){
      if (tab.id !== tabs.activeTab.id) return;//make sure it's the active tab
        
        let hostname = URL(tab.url).hostname;

        //TODO: use pattern matching 
        // https://developer.mozilla.org/en-US/Add-ons/SDK/Low-Level_APIs/util_match-pattern
        if (!hostname || hostname === "about:newtab" || hostname === "about:blank") return;//to handle new tabs and blank pages

        //TOTHINK: potential namespace conflict      
        if (hostname === tab.hostname) return; //not a fresh url open

        if (!tab.hostname){
          tab.hostname = hostname;
          unload(function(){if (tab) delete tab.hostname;})
        }
        else
        {
          tab.hostname = hostname;
          listener.moment("active-tab-hostname-progress");   
        }

    });
  },

  "window-open": function(){

    listener.addEventListener("#cmd_newNavigator", "command", function(e){
      listener.moment('window-open');
    });

  },

  "tab-new-recently-active5s": function(){
     listener.addEventListener("#cmd_newNavigatorTab", "command", function(e){

        if (!timer.isRecentlyActive(5, 5))
         return;

         listener.moment('tab-new-recently-active5s', {reject: true});
      });
  },

  "tab-new-recently-active5s-no-tab": function(){
    listener.listenForUserActivity(function(e){
      
      if (!timer.isRecentlyActive(5, 5)) 
       return;

      listener.moment('tab-new-recently-active5s-no-tab', {reject: true});
    });
  },

  "tab-new-recently-active10s": function(){
     listener.addEventListener("#cmd_newNavigatorTab", "command", function(e){

        if (!timer.isRecentlyActive(5, 10))
         return;

         listener.moment('tab-new-recently-active10s');
      });
  },

  "tab-new-recently-active10s-no-tab": function(){
    listener.listenForUserActivity(function(e){
      
      if (!timer.isRecentlyActive(10, 10)) 
       return;

      listener.moment('tab-new-recently-active10s-no-tab', {reject: true});
    });
  },

  "tab-new-recently-active0s": function(){
     listener.addEventListener("#cmd_newNavigatorTab", "command", function(e){

        if (!timer.isRecentlyActive(5))
         return;

         listener.moment('tab-new-recently-active0s', {reject: true});
      });
  },

  "tab-new-recently-active10m": function(){
    listener.addEventListener("#cmd_newNavigatorTab", "command", function(e){
      if (!timer.isRecentlyActive(10, 10*60)) 
       return;

       listener.moment('tab-new-recently-active10m', {reject: true});
    });
  },

  "tab-new-recently-active10m-no-tab": function(){
    
   listener.listenForUserActivity(function(e){
      
      if (!timer.isRecentlyActive(10, 10*60)) 
       return;

      listener.moment('tab-new-recently-active10m-no-tab', {reject: true});
    });
  },

  "tab-new-recently-active20m": function(){
    listener.addEventListener("#cmd_newNavigatorTab", "command", function(e){
      if (!timer.isRecentlyActive(10, 20*60)) 
       return;

       listener.moment('tab-new-recently-active20m', {reject: true});
    });
  },

  "tab-new-recently-active20m-no-tab": function(){
    
    listener.listenForUserActivity(function(e){
      
      if (!timer.isRecentlyActive(10, 20*60)) 
       return;

      listener.moment('tab-new-recently-active20m-no-tab');
    });
  },

  "tab-new-recently-active30m": function(){
    listener.addEventListener("#cmd_newNavigatorTab", "command", function(e){
      if (!timer.isRecentlyActive(10, 30*60)) 
       return;

       listener.moment('tab-new-recently-active30m', {reject: true});
    });
  },

  "tab-new-recently-active30m-no-tab": function(){
    listener.listenForUserActivity(function(e){

      if (!timer.isRecentlyActive(10, 30*60)) 
       return;

      listener.moment('tab-new-recently-active30m-no-tab', {reject: true});
    });
  }
}

listener.addEventListener = function(querySelector, eventName, handler){
  let windowTracker = new WindowTracker({
      onTrack: function(window){
        if (!isBrowser(window)) return;

        let elem = window.document.querySelector(querySelector);
        elem.addEventListener(eventName, handler);
        unload(function(){elem.removeEventListener(eventName, handler)});
      }
    });
}


listener.moment = function(name, options){

  let dEffFrequency = 1/prefs["moment.dEffFrequency_i"];

  let deliver = true;
  let data = momentData[name];
  let allData = momentData["*"];

  console.log("moment triggered -> " + name);

  data.count = data.count + 1;
  allData.count = allData.count + 1;
  momentData[name] = data;
  momentData["*"] = allData;

  updateFrequencies(name);

  if (options && options.reject){
    deliver = false;
    console.log("delivery rejection forced");
  }

  if (prefs["delivery.mode.observ_only"]){
    deliver = false;
    console.log("delivery rejected due to: observation-only period");
  }

  if (timer.isSilent()){
    deliver = false;
    console.log("delivery rejected due to: silence");
  }

  if (data.effFrequency && 1/data.effFrequency < prefs["moment.min_effFrequency_i"]){
    deliver = false;
    console.log("delivery rejected due to: effective frequency = " + data.effFrequency);
  }

  if (data.rEffCount && data.rEffCount > prefs["moment.max_rEffCount"]){
    deliver = false;
    console.log("delivery rejected due to: recent effective count = " + data.effCount);
  }

  let prob = 1; 
  if (data.frequency < dEffFrequency)
    prob = 1;
  else
    prob = dEffFrequency/data.frequency;

  if (Math.random() > prob){
    deliver = false; 
    console.log("delivery rejected due to: sampling, prob = " + prob);
  }

  if (options && options.force){
    console.log("moment notification delivery forced");
    deliver = true;
  }

  if (deliver){

    console.log("moment notification delivered -> " + name);

    data = momentData[name];
    allData = momentData["*"];
    data.effCount = data.effCount + 1;
    allData.effCount = allData.effCount + 1;
    let ts = data.timestamps;
    let allTs = allData.timestamps;
    ts.push(Date.now());
    allTs.push(Date.now());
    data.timestamps = ts;
    allData.timestamps = allTs;

    momentData[name] = data;
    momentData["*"] = allData; 


    dh.present(function(result){
      let data = momentData[name];
      let allData = momentData["*"];

      if (result.type === "rate"){
        console.log("rate submitted for " + name + ": " + result.rate);
        data.rates.push(result.rate);
        allData.rates.push(result.rate);
      }
      if (result.type === "timeout"){
        console.log("panel for " + name + " timed out");
        data.rates.push("timeout");
        allData.rates.push("timeout");
      }

      momentData[name] = data;
      momentData["*"] = allData;

      logger.logMomentDelivery(merge({name: name}, result));

      if (prefs["delivery.mode.no_silence"])
        timer.endSilence();
    });

    timer.silence();
  }

  
  // momentData[name] = data;

};

listener.listenForUserActivity = function(callback){
  events.on("user-interaction-active", callback, true);
  unload(function(){events.off("user-interaction-active", callback)});
}

const debug = {
  init: function(){
    handleCmd(this.parseCmd);
  },
  parseCmd: function(cmd){
    const patt = /([^ ]*) *(.*)/; 
    let args = patt.exec(cmd);

    let name = args[1];
    let params = args[2];
    let subArgs;

    switch (name){
      case "moment":

        subArgs = params.split(" ");

        let mName = subArgs[0];
        let mode = subArgs[1];

        let short = {
          "s": "startup",
          "athp": "active-tab-hostname-progress",
          "tnra10s": "tab-new-recently-active10s",  
          "tnra10m": "tab-new-recently-active10m",
          "wo": "window-open"
        }

        if (!listener.momentListeners[mName] && !short[mName])
          return "moment '" + mName + "'' does not exist.";

        let m;

        if (listener.momentListeners[mName])
          m = mName;
        else
          m = short[mName];

        listener.moment(m, {force: (mode === "-force")});

        return mName + " triggered.";
        break;


      case "delmode":
        subArgs = patt.exec(params);

        if (!subArgs[0])
          return "error: incorrect use of delmode command.";

        let subMode = subArgs[1];

        switch (subMode){
          case "observ_only":
            if (subArgs[2] != "true" && subArgs[2] != "false") 
              return "error: incorrect use of delmode observ_only command.";

            prefs["delivery.mode.observ_only"] = JSON.parse(subArgs[2]);

            return "observ_only mode is now " + (JSON.parse(subArgs[2]) ? "on": "off");

            break;
          default:
            return "error: incorrect use of delmode command.";
        }
        break;

      default:
        return undefined;
    }

  }
}


function unloadController(){

}

exports.init = init;