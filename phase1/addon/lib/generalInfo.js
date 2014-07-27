/*! This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

"use strict";

const {Cu} = require("chrome");
Cu.import("resource://gre/modules/AddonManager.jsm");
var config = require("./config");
var {sendToGA, sendEvent, override} = require("./utils");
var genPrefs = require("sdk/preferences/service");
var prefs = require("sdk/simple-prefs").prefs;
var system = require("sdk/system");
var logger = require("./logger");
var arms = require("./arms");
var ui = require("./ui");
var tabs = require("sdk/tabs");
var FHR = require("./FHR");


function getAddons(callback){
	AddonManager.getAllAddons(function(aAddons) {
	callback(aAddons);
	});
}

function userHasAddonById(id, callback){
	AddonManager.getAllAddons(function(aAddons) {
		
		for (var i = 0; i < aAddons.length; i++)
			if (aAddons[i].id == id) {callback(true); return;}

		callback(false);
	});
}

function setIsFirstTime(){
	prefs["general.isFirstTime"] = false;
}

function isThisFirstTime(){
	
	return (prefs["general.isFirstTime"] || !("general.isFirstTime" in prefs));
}
// also sets start date when called for the first time
function getStartTimeMs(){
	// prefs["expStartTimeMs"] = Date.now().toString();
	if (!isThisFirstTime()) //TODO: change this, isThisFirstTime is not a reliable method
		return prefs["general.expStartTimeMs"];
	else	{
		prefs["general.expStartTimeMs"] = Date.now().toString(); //set for the first time
		return prefs["general.expStartTimeMs"];
	}
}

function getUserId(){
	if (!isThisFirstTime()) 
		return prefs["general.userId"];
	else {

		prefs["general.userId"] = require("sdk/util/uuid").uuid().toString().slice(1,-1); //set for the first time
		return prefs["general.userId"];
	}

}

function getTestMode(){
	//test mode
	if ("test_mode" in system.staticArgs)
		prefs["config.test_mode"] =  system.staticArgs.test_mode;
	else
		if (!( "config.test_mode" in prefs)){
			// throw Error("test_mode state not specified properly. use --static-args to define set .test_mode to either \"true\" or \"false\"");
			prefs["config.test_mode"] = false;
		}

	logger.log("TEST_MODE = " + prefs["config.test_mode"]);	
	
	return prefs["config.test_mode"];

}

function getLocale(){
	return genPrefs.get("general.useragent.locale");
}

function getUpdateChannel(){
	return genPrefs.get("app.update.channel");
}

function getSystemInfo(){
	var info = {
		systemname: system.name,
		systemversion: system.version,
		os: system.platform

	};
	return info;
}

function getAddonVersion(){
	return require("sdk/self").version;
}

function getArm(){

	console.log("in getArm");

	

	if (!isThisFirstTime())
		return JSON.parse(prefs["config.arm"]);
		
	else {
		if ("arm_weights" in system.staticArgs){
			prefs["config.arm"] = JSON.stringify(arms.assignRandomArm(system.staticArgs.arm_weights));
			return JSON.parse(prefs["config.arm"]);
		}

		prefs["config.arm"] = JSON.stringify(arms.assignRandomArm(config.DEFAULT_ARM_WEIGHTS));
		return JSON.parse(prefs["config.arm"]);
		
	}

}

function setDefaultNotification(){

	var triggerId = "defaultmessage";

	ui.showNotification({
		message: config.DEFAULT_MESSAGE,
		header: config.DEFAULT_HEADER,
		reactionType: "openlinkinnewtab",
		reactionOptions: {url: config.DEFAULT_MESSAGE_URL},
		
		buttonLabel: config.DEFAULT_BUTTON_LABEL,
		id: "defaultmessage",
		hidePanel: true,
		explanationHide: true,
		buttonOff: true
		});
}
function registerFirstTimePrefs(){
	getUserId();
	getTestMode();
	getStartTimeMs();
	getArm();
	setIsFirstTime();

}

function getMetakeyStr(){
	return (getSystemInfo().os == "darwin" ? "Command" : "CTRL");
}

function isAddonInstalled(addonId, callback){
	
	AddonManager.getAllAddons(function(aAddons) {
		for (var i = 0; i < aAddons.length; i++)
			if (aAddons[i].id == addonId) callback(true);

		callback(false);
	});
}

function getFHRdata(){
	if (!FHR.reporter) return;

  	FHR.reporter.onInit().then(function() {
    	return FHR.reporter.collectAndObtainJSONPayload(true)
    }).then(function(data) {
    	return parseFHRpayload(data);
    });
}

function parseFHRpayload(data){
    console.log(JSON.stringify(data, null, 2));
    // return usage statistic
}

function sendInstallInfo(){
	var OUTtype = config.TYPE_INSTALL;
	var OUTval = {};
	var OUTid = config.ID_NA;

	//addon info
	var addonNames = [];
	var addonIds = [];
	var addonTypes = [];
	var addonActivities = [];
	var arr = [];
	var searchenginename = genPrefs.get("browser.search.defaultenginename");
	var isdntenabled = genPrefs.get("privacy.donottrackheader.enabled");
	var dntvalue = genPrefs.get("privacy.donottrackheader.value");
	var ishistoryenabled = genPrefs.get("places.history.enabled");
	var uiclutter = JSON.parse(genPrefs.get("browser.uiCustomization.state"));
	var activeThemeId = "none";
	var activeThemeName = "none";

	AddonManager.getAddonsByTypes(['extension'], function (addons) {
	
		for (var i = 0; i < addons.length; i++){
			// console.addons[i].type);
			addonNames.push(addons[i].name);
			addonIds.push(addons[i].id);
			addonTypes.push(addons[i].type);
			addonActivities.push(addons[i].isActive);

		}

		AddonManager.getAddonsByTypes(['theme'], function (addons) {
			

			for (var i = 0; i < addons.length; i++){

				addonNames.push(addons[i].name);
				addonIds.push(addons[i].id);
				addonTypes.push(addons[i].type);
				addonActivities.push(addons[i].isActive);
				if (addons[i].isActive) {activeThemeId = addons[i].id; activeThemeName = addons[i].name;}
			}
			
			try {
				
				OUTval = require("./utils").override(OUTval, {addonnames: addonNames, addonids: addonIds, addontypes: addonTypes, activeThemeId: activeThemeId, activeThemeName: activeThemeName, searchenginename: searchenginename, isdntenabled: isdntenabled, dntvalue: dntvalue, ishistoryenabled: ishistoryenabled, uiclutter: uiclutter});						
				OUTval.expStartTimeMs = getStartTimeMs();
			}
			catch (e){
				console.log(e.message);
			}


			try {
				require("./utils").sendEvent(OUTtype, OUTval, OUTid);			
			}
			catch (e){
				console.log(e.message);
			}
			

		});

		
	}); 
	
	
	
}

exports.registerFirstTimePrefs = registerFirstTimePrefs;
exports.getAddons = getAddons;
exports.userHasAddonById = userHasAddonById;
exports.getStartTimeMs = getStartTimeMs;
exports.isThisFirstTime = isThisFirstTime;
exports.sendInstallInfo = sendInstallInfo;
exports.getUserId = getUserId;
exports.getTestMode = getTestMode;
exports.getLocale = getLocale;
exports.getUpdateChannel = getUpdateChannel;
exports.getSystemInfo = getSystemInfo;
exports.getAddonVersion = getAddonVersion;
exports.getMetakeyStr = getMetakeyStr;
exports.setDefaultNotification = setDefaultNotification;
exports.getArm = getArm;