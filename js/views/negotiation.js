/**
 * @name views.negotiation
 * @namespace Contract negotiation.
 */
'use strict';

var dao = require('../dao');
var g = require('../globals');
var ui = require('../ui');
var contractNegotiation = require('../core/contractNegotiation');
var freeAgents = require('../core/freeAgents');
var player = require('../core/player');
var team = require('../core/team');
var ko = require('knockout');
var bbgmView = require('../util/bbgmView');
var helpers = require('../util/helpers');

// Show the negotiations list if there are more ongoing negotiations
function redirectNegotiationOrRoster(cancelled) {
    dao.negotiations.getAll().then(function (negotiations) {
        if (negotiations.length > 0) {
            ui.realtimeUpdate([], helpers.leagueUrl(["negotiation"]));
        } else if (cancelled) {
            ui.realtimeUpdate([], helpers.leagueUrl(["free_agents"]));
        } else {
            ui.realtimeUpdate([], helpers.leagueUrl(["roster"]));
        }
    });
}

function generateContractOptions(contract, value, valueNoPot) {
    var contractOptions, exp, factor, found, i;

    exp = g.season;
    if (g.phase > g.PHASE.AFTER_TRADE_DEADLINE) {
        exp += 1;
    }

    contractOptions = [];
    found = null;
    for (i = 0; i < 5; i++) {
        contractOptions[i] = {
            exp: exp + i,
            years: 1 + i,
            amount: 0,
            smallestAmount: false
        };

        if (contractOptions[i].exp === contract.exp) {
            contractOptions[i].amount = contract.amount;
            contractOptions[i].smallestAmount = true;
            found = i;
        }
    }
    if (found === null) {
        contractOptions[0].amount = contract.amount;
        contractOptions[0].smallestAmount = true;
        found = 0;
    }

    // From the desired contract, ask for more money for less or more years
    for (i = 0; i < 5; i++) {
        factor = 1 + Math.abs(found - i) * 0.15;
        contractOptions[i].amount = contractOptions[found].amount * factor;
    }

console.log(contractOptions);
    return contractOptions;
}

function get(req) {
    var pid;

    pid = parseInt(req.params.pid, 10);

    return {
        pid: pid >= 0 ? pid : null // Null will load whatever the active one is
    };
}

function post(req) {
    var pid, teamAmountNew, teamYearsNew;

    pid = parseInt(req.params.pid, 10);

    if (req.params.hasOwnProperty("cancel")) {
        contractNegotiation.cancel(pid).then(function () {
            redirectNegotiationOrRoster(true);
        });
    } else if (req.params.hasOwnProperty("accept")) {
        contractNegotiation.accept(pid).then(function (error) {
            if (error !== undefined && error) {
                helpers.errorNotify(error);
            }
            redirectNegotiationOrRoster(false);
        });
    } else if (req.params.hasOwnProperty("new")) {
        // If there is no active negotiation with this pid, create it
        dao.negotiations.get({key: pid}).then(function (negotiation) {
            var tx;
            if (!negotiation) {
                tx = dao.tx(["gameAttributes", "messages", "negotiations", "players"], "readwrite");
                contractNegotiation.create(tx, pid, false).then(function (error) {
                    tx.complete().then(function () {
                        if (error !== undefined && error) {
                            helpers.errorNotify(error);
                            ui.realtimeUpdate([], helpers.leagueUrl(["free_agents"]));
                        } else {
                            ui.realtimeUpdate([], helpers.leagueUrl(["negotiation", pid]));
                        }
                    });
                });
            } else {
                ui.realtimeUpdate([], helpers.leagueUrl(["negotiation", pid]));
            }
        });
    } else {
        // Make an offer to the player;
        teamAmountNew = parseInt(req.params.teamAmount * 1000, 10);
        teamYearsNew = parseInt(req.params.teamYears, 10);

        // Any NaN?
        if (teamAmountNew !== teamAmountNew || teamYearsNew !== teamYearsNew) {
            ui.realtimeUpdate([], helpers.leagueUrl(["negotiation", pid]));
        } else {
            contractNegotiation.offer(pid, teamAmountNew, teamYearsNew).then(function () {
                ui.realtimeUpdate([], helpers.leagueUrl(["negotiation", pid]));
            });
        }
    }
}

function updateNegotiation(inputs) {
    // Call getAll so it works on null key
    return dao.negotiations.getAll({key: inputs.pid}).then(function (negotiations) {
        var negotiation;

        if (negotiations.length === 0) {
            return {
                errorMessage: "No negotiation with player " + inputs.pid + " in progress."
            };
        }

        negotiation = negotiations[0];

        negotiation.player.expiration = negotiation.player.years + g.season;
        // Adjust to account for in-season signings
        if (g.phase <= g.PHASE.AFTER_TRADE_DEADLINE) {
            negotiation.player.expiration -= 1;
        }

        // Can't flatten more because of the return errorMessage above
        return dao.players.get({
            key: negotiation.pid
        }).then(function (p) {
console.log(p);
            p = player.filter(p, {
                attrs: ["pid", "name", "contract", "freeAgentMood"],
                ratings: ["ovr", "pot"],
                season: g.season,
                showNoStats: true,
                showRookies: true,
                fuzz: true
            });

            // This can happen if a negotiation is somehow started with a retired player
            if (!p) {
                contractNegotiation.cancel(negotiation.pid);
                return {
                    errorMessage: "Invalid negotiation. Please try again."
                };
            }

            p.contract.amount = freeAgents.amountWithMood(p.contract.amount, p.freeAgentMood[g.userTid]);

            // See views.freeAgents for moods as well
            if (p.freeAgentMood[g.userTid] < 0.25) {
                p.mood = '<span class="text-success"><b>Eager to reach an agreement.</b></span>';
            } else if (p.freeAgentMood[g.userTid] < 0.5) {
                p.mood = '<b>Willing to sign for the right price.</b>';
            } else if (p.freeAgentMood[g.userTid] < 0.75) {
                p.mood = '<span class="text-warning"><b>Annoyed at you.</b></span>';
            } else {
                p.mood = '<span class="text-danger"><b>Insulted by your presence.</b></span>';
            }
            delete p.freeAgentMood;

            // Generate contract options
            p.contractOptions = generateContractOptions(p.contract, p.value, p.valueNoPot);
console.log(p);

            return team.getPayroll(null, g.userTid).get(0).then(function (payroll) {
                return {
                    salaryCap: g.salaryCap / 1000,
                    payroll: payroll / 1000,
                    player: p,
                    negotiation: {
                        team: {
                            amount: negotiation.team.amount / 1000,
                            years: negotiation.team.years
                        },
                        player: {
                            amount: negotiation.player.amount / 1000,
                            expiration: negotiation.player.expiration,
                            years: negotiation.player.years
                        },
                        resigning: negotiation.resigning
                    }
                };
            });
        });
    });
}

function uiFirst(vm) {
    ko.computed(function () {
        ui.title("Contract Negotiation - " + vm.player.name());
    }).extend({throttle: 1});
}

module.exports = bbgmView.init({
    id: "negotiation",
    get: get,
    post: post,
    runBefore: [updateNegotiation],
    uiFirst: uiFirst
});
