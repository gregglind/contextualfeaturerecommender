/*! This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

"use strict";

const {prefs} = require("sdk/simple-prefs");
const {eventData} = require("./event");
const {storage} = require("sdk/simple-storage");
const self = require("./self");
const exp = require("./experiment");
const AS = require("./async-storage").AsyncStorage; //TODO: use async storage as a mode of persistent object
const {dumpUpdateObject, handleCmd, isEnabled, removeList} = require("./debug");
const {elapsedTime, elapsedTotalTime, onTick} = require("./timer");
const {PersistentObject} = require("./utils");
const {merge} = require("sdk/util/object");

const statsDataAddress = "stats.data";
const statsData = PersistentObject("simplePref", {address: statsDataAddress});

const config = {
  name: 'stats-db',
  version: 1
}

AS.open(config);

function init(){

  console.log("initializing stats");

  if (!statsData.count){
    statsData.eventCount = 0;
  }

  handleCmd(debug.parseCmd);

  debug.update();

}

function getRouteStats(baseRoute){
  let data = eventData[baseRoute];

  if (!data)
    console.log("warning: no event data for " + baseRoute);
  return data;
}


function event(evtId, options, addData){

  let prefix = options && options.prefix;
  let collectInstance = options && options.collectInstance;

  if (prefix)
    evtId = ["[", prefix, "] ", evtId].join("");

  let instance = merge({},getContext(),addData);

  const updateEvt = function(ev, inst){
    if (!ev){
      ev = {};
      ev.instances = [];
      ev.count = 0;
    }

    if (collectInstance) ev.instances.push(inst);
    ev.count = ev.count + 1;
    ev.freq = ev.count / (inst.et+1);
    ev.ifreq = (inst.et+1) / ev.count;
    ev.tfreq = ev.count / (inst.ett);
    ev.tifreq = inst.ett / ev.count;

    if (!ev[inst.stage])
      ev[inst.stage] = {count: 0}

    ev[inst.stage].count = ev[inst.stage].count + 1;
    ev[inst.stage].freq = ev[inst.stage].count / (inst.et+1);
    ev[inst.stage].ifreq = (inst.et+1) / ev[inst.stage].count;
    ev[inst.stage].tfreq = ev[inst.stage].count / (inst.ett);
    ev[inst.stage].tifreq = inst.ett / ev[inst.stage].count;

    return ev;
  };

  AS.getItem(evtId).then(function(evt){
      return updateEvt(evt, instance);
    }).then(function(evt){
        AS.setItem(evtId, evt);
        statsData.eventCount += 1;
        debug.update(evtId);
      }).catch((e) => {throw e});
} 

function getContext(){

  let now = new Date();

  return {
    ts: now.getTime(),
    hour: now.getHours(),
    day: now.getDay(),
    et: elapsedTime(),
    ett: elapsedTotalTime(),
    stage: exp.info.stage
  };
}

const debug = {
  init: function(){
    handleCmd(this.parseCmd);
  },
  update: function(key){

    if (!isEnabled) return;

    if (!prefs["stats.send_to_debug"]) return;

    if (!key){ // update all
      AS.keys().then(function(keys){
        let updateObj = {};

        let promises = [];
        keys.forEach((key) => { promises.push(AS.getItem(key)) });

        return Promise.all(promises).then(function(vals){
          for (let i in keys){
            updateObj[keys[i]] = vals[i];
          }

          return updateObj;
        });
      }).then(function(updateObj){
          dumpUpdateObject(updateObj, {list: "Stats"});
        }).catch((e) => {throw e;});
    }
    else
    {
      AS.getItem(key).then(function(v){
        let obj = {};
        obj[key] = v;
        dumpUpdateObject(obj, {list: "Stats"});
      }).catch((e) => {throw e;});
    }

  },

  remove: function(){
    removeList("Stats");
  },

  parseCmd: function(cmd){
    const patt = /([^ ]*) *(.*)/; 
    let args = patt.exec(cmd);

    let subArgs;
    
    if (!args)  //does not match the basic pattern
      return false;

    let name = args[1];
    let params = args[2];

    switch(name){
      case "stats":
        switch(params){

          case "on":
            prefs["stats.send_to_debug"] = true;
            debug.update();
            return "stats on";
            break;

          case "off":
            prefs["stats.send_to_debug"] = false;
            debug.remove();
            return "stats off"
            break;

          default:
            return "warning: incorrect use of the stats command.";

        }

        break;

      default:
        return undefined;
    }

    return " ";
  }
}


exports.init = init;
exports.event = event;