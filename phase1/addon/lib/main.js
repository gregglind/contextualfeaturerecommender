/*! This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */


"use strict";

const STUDYLIFETIME = 14 * 86400 * 1000;  // milliseconds

var triggers = require("./triggers");
var logger = require("./logger");
var info = require("./generalInfo");
var featuredata = require("./featuredata");
var {WindowTracker} = require("sdk/deprecated/window-utils");
var {isBrowser} = require("sdk/window/utils");
var config = require("./config");
var ui = require("./ui")
var utils = require("./utils");
var {blushiness} = require("./blush");
var system = require("sdk/system");
var prefs = require("sdk/simple-prefs").prefs;

const REASON = [ 'unknown', 'startup', 'shutdown', 'enable', 'disable',
'install', 'uninstall', 'upgrade', 'downgrade' ];

function firstRun(){
	logger.log("Running for the first time...");
	info.registerFirstTimePrefs();
	info.sendInstallInfo();

	//setting the default notification
	info.setDefaultNotification();
	
}

function lastRun(reason){

	//send last call
	logger.log("lastRun called");
	utils.sendLastCallEvent(reason);
}


function reset(){
	console.log("Resetting...");

	for (var key in prefs)
		delete prefs[key];
}

// if the button goes, uninstall addon.
//var 
//{"placements":{"PanelUI-contents":["edit-controls","zoom-controls","new-window-button","privatebrowsing-button","save-page-button","print-button","history-panelmenu","fullscreen-button","find-button","preferences-button","add-ons-button","developer-button"],"addon-bar":["addonbar-closebutton","status-bar"],"PersonalToolbar":["personal-bookmarks"],"nav-bar":["urlbar-container","search-container","webrtc-status-button","bookmarks-menu-button","downloads-button","home-button","social-share-button","action-button--featurerecommenderinsightsmozillacom-init-button"],"TabsToolbar":["tabbrowser-tabs","new-tab-button","alltabs-button"]},"seen":["action-button--featurerecommenderinsightsmozillacom-init-button"],"dirtyAreaCache":["PersonalToolbar","nav-bar","TabsToolbar"],"newElementCount":0}

let allprefs = require("sdk/preferences/event-target").PrefsTarget({branchName:""});
allprefs.on("browser.uiCustomization.state", function (pref) {
	let addonid = require('sdk/self').id;
	console.log("PREF:", allprefs.prefs[pref]);
	let data = JSON.parse(allprefs.prefs[pref]);
	let bid = "action-button--featurerecommenderinsightsmozillacom-init-button";
	let pl = data.placements;
	let has = (arr, el) => arr.indexOf(el) >= 0;

	if (has(pl["nav-bar"],bid) ||
		has(pl["PersonalToolbar"],bid) ||
		has(pl["addon-bar"],bid) ) 
	{
		console.log("button is fine!")
		// okay!
	} else {
		// send final message?
		console.log("button moved, uninstalling addon");
  		require("sdk/addon/installer").uninstall(addonid);
	}
});

//start listening when button is clicked
var main = exports.main = function (options, callbacks){
	console.log(require("sdk/self").data.url());
	
	var reason = options.loadReason;

	if (system.staticArgs.reset) reset();

	//sending the load message to GA
	utils.sendLoadEvent(reason);

	ui.init();
	

	//check if this is the first time 
	if (info.isThisFirstTime())
		firstRun();

	


	// death timer, re #71. backstopped by addon update to 'dead' addon.
	if (Date.now() - Number(info.getStartTimeMs()) >= STUDYLIFETIME) {
		require("sdk/addon/installer").uninstall(require("sdk/self").id);
	};

	//start triggers
	triggers.init();


}

var onUnload = exports.onUnload = function (reason){
	utils.sendLoadEvent(reason);
	if (reason == 'uninstall' || reason == 'disable'){
		lastRun(reason);
	}

}

