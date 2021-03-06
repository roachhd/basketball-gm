const g = require('../globals');
const season = require('../core/season');
const bbgmViewReact = require('../util/bbgmViewReact');
const Live = require('./views/Live');

async function updateGamesList() {
    const games = await season.getSchedule({oneDay: true});

    for (const game of games) {
        if (game.awayTid === g.userTid || game.homeTid === g.userTid) {
            game.highlight = true;
        } else {
            game.highlight = false;
        }
        game.awayRegion = g.teamRegionsCache[game.awayTid];
        game.awayName = g.teamNamesCache[game.awayTid];
        game.homeRegion = g.teamRegionsCache[game.homeTid];
        game.homeName = g.teamNamesCache[game.homeTid];
    }

    return {
        games,
    };
}

async function updateGamesInProgress(inputs, updateEvents) {
    if (updateEvents.indexOf("dbChange") >= 0 || updateEvents.indexOf("g.gamesInProgress") >= 0) {
        return {
            gamesInProgress: g.gamesInProgress,
        };
    }
}

module.exports = bbgmViewReact.init({
    id: "live",
    runBefore: [updateGamesList, updateGamesInProgress],
    Component: Live,
});
