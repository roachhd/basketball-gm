const db = require('../db');
const g = require('../globals');
const ui = require('../ui');
const league = require('../core/league');
const $ = require('jquery');
const ko = require('knockout');
const helpers = require('./helpers');

async function beforeLeague(req) {
    g.lid = parseInt(req.params.lid, 10);

    const popup = req.params.w === "popup";

    // Check for some other window making changes to the database
    const checkDbChange = async lid => {
        // Stop if the league isn't viewed anymore
        if (lid !== g.lid) {
            return;
        }

        // league.loadGameAttribute cannot be used to check for a new lastDbChange because we need to have the old g.lastDbChange available right up to the last moment possible, for cases where league.loadGameAttribute might be blocked during a slow page refresh, as happens when viewing player rating and stat distributions. Otherwise, an extra refresh would occur with a stale lastDbChange.
        const lastDbChange = await g.dbl.gameAttributes.get("lastDbChange");
        if (g.lastDbChange !== lastDbChange.value) {
            await league.loadGameAttributes(null);
            //leagueContentEl.innerHTML = "&nbsp;";  // Blank doesn't work, for some reason
            ui.realtimeUpdate(["dbChange"], undefined, async () => {
                await ui.updatePlayMenu(null);
                ui.updatePhase();
                ui.updateStatus();
                setTimeout(() => checkDbChange(lid), 3000);
            });
        } else {
            setTimeout(() => checkDbChange(lid), 3000);
        }
    };

    // Make sure league exists

    // Handle some common internal parameters
    const updateEvents = req.raw.updateEvents !== undefined ? req.raw.updateEvents : [];
    const reqCb = req.raw.cb !== undefined ? req.raw.cb : () => {};

    // Make sure league template FOR THE CURRENT LEAGUE is showing
    if (g.vm.topMenu.lid() !== g.lid) {
        // Clear old game attributes from g, to make sure the new ones are saved to the db in league.setGameAttributes
        helpers.resetG();

        // Make sure this league exists before proceeding
        const l = await g.dbm.leagues.get(g.lid);
        if (l === undefined) {
            helpers.error('League not found. <a href="/new_league">Create a new league</a> or <a href="/">load an existing league</a> to play!', reqCb, true);
            return [[], () => {}, 'abort'];
        }

        await db.connectLeague(g.lid);
        await league.loadGameAttributes(null);

        ui.update({
            container: "content",
            template: "leagueLayout",
        });
        ko.applyBindings(g.vm.topMenu, document.getElementById("left-menu"));

        // Set up the display for a popup: menus hidden, margins decreased, and new window links removed
        if (popup) {
            $("#top-menu").hide();
            $("body").css("padding-top", "0");

            const css = document.createElement("style");
            css.type = "text/css";
            css.innerHTML = ".new_window { display: none }";
            document.body.appendChild(css);
        }

        // Update play menu
        ui.updateStatus();
        ui.updatePhase();
        await ui.updatePlayMenu(null);
        g.vm.topMenu.lid(g.lid);
        checkDbChange(g.lid);
        return [updateEvents, reqCb];
    }

    return [updateEvents, reqCb];
}

// Async just because it needs to resolve to a promise
async function beforeNonLeague(req) {
    g.lid = null;
    g.vm.topMenu.lid(undefined);

    const updateEvents = (req !== undefined && req.raw.updateEvents !== undefined) ? req.raw.updateEvents : [];
    const reqCb = (req !== undefined && req.raw.cb !== undefined) ? req.raw.cb : () => {};
    return [updateEvents, reqCb];
}

module.exports = {
    beforeLeague,
    beforeNonLeague,
};
