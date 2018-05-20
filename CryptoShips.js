"use strict";

$("#header").load('header.html');        
$("#footer").load('footer.html');    

// Global variables used by our Dapp
var contract_address = "n1wv1RKmbGC42WZPhjwm5EyKPZ38AbcEmFi";


var on_start = new Observable();
var on_opponent_connected = new Observable();
var on_my_turn = new Observable();
var on_opponent_shot = new Observable();
var on_my_turn_over = new Observable(); // TODO

// TODO
// Leaderboard: +10 winning, +1 losing, -5 for timeout/cheating
//      +1 win, -1 lose, -10 timeout/cheat
// - Front: Anytime eligable for timeout, present a button to the user.
// - Front: poll for a concede which could happen anytime
// - Front: allow resumbitting transactions like shoot 
// - Front: poll the check for game in progress when first landing on the site (in case first request failed?)
// - Front: Sound effects (with mute button)
// - Front: Status message / indicator of last refresh time
// - Front: First land on page presents wallet issue
// - Not enough gas by default for concede game.  Also how to resubmit transactions.

var auto_refresh_interval = 3000; // 3 seconds
var target_x, target_y;
var player_board_layout;
var board_cells;
var turn_counter = -1;
var last_shot_is_hit;
var revealed_ships;







// TODO should be randomized with each game and stored locally
var board_seeds = [["tbd","tbd","tbd","tbd","tbd","tbd","tbd","tbd","tbd","tbd"],["tbd","tbd","tbd","tbd","tbd","tbd","tbd","tbd","tbd","tbd"],["tbd","tbd","tbd","tbd","tbd","tbd","tbd","tbd","tbd","tbd"],["tbd","tbd","tbd","tbd","tbd","tbd","tbd","tbd","tbd","tbd"],["tbd","tbd","tbd","tbd","tbd","tbd","tbd","tbd","tbd","tbd"],["tbd","tbd","tbd","tbd","tbd","tbd","tbd","tbd","tbd","tbd"],["tbd","tbd","tbd","tbd","tbd","tbd","tbd","tbd","tbd","tbd"],["tbd","tbd","tbd","tbd","tbd","tbd","tbd","tbd","tbd","tbd"],["tbd","tbd","tbd","tbd","tbd","tbd","tbd","tbd","tbd","tbd"],["tbd","tbd","tbd","tbd","tbd","tbd","tbd","tbd","tbd","tbd"]];         

function findShipByCoords(x, y) 
{
    var keys = Object.keys(player_board_layout);
    for(var i = 0; i < keys.length; i++)
    {
        var key = keys[i];
        var current_ship = player_board_layout[key];
        if (current_ship.is_horizontal) 
        {
            if (y === current_ship.start_y &&
                x >= current_ship.start_x &&
                x < current_ship.start_x + current_ship.length) 
                {
                return {
                    name: key, 
                    start_x: current_ship.start_x, 
                    start_y: current_ship.start_y, 
                    is_horizontal: current_ship.is_horizontal, 
                    length: current_ship.length
                };
            } 
            else 
            {
                continue;
            }
        } 
        else 
        {
            if (x === current_ship.start_x &&
                y >= current_ship.start_y &&
                y < current_ship.start_y + current_ship.length) 
            {
                return {
                    name: key, 
                    start_x: current_ship.start_x, 
                    start_y: current_ship.start_y, 
                    is_horizontal: current_ship.is_horizontal, 
                    length: current_ship.length
                };
            } 
            else
             {
                continue;
            }
        }
    }
};

function getMyGameInProgress() {
    nebPay.simulateCall(contract_address, 0, "getMyGameInProgress", null, {
        listener: onGetMyGameInProgress
    });
}

function onGetMyGameInProgress(resp) {
    var response = JSON.parse(resp.result);
    if(response) {
        $("#game_txhash").val(response);
    }
}

function getGameInfo() {
    nebPay.simulateCall(contract_address, 0, "getDataForGameid", JSON.stringify([$("#gameid").val()]), {
        listener: onGetGameInfo
    });
}

function onGetGameInfo(resp) {
    if(resp) {
        console.log(resp);
    }
}

function boardToSecret(board_cells) {
    var board_secrets = [];
    for(var x = 0; x < 10; x++) {
        board_secrets.push([]);
        for(var y = 0; y < 10; y++) {
            board_secrets[x].push(sha256((board_cells[y][x] == 0 ? 0 : 1) + board_seeds[x][y]));
        }                
    }
    return board_secrets;
}


function startGame(my_player_board_layout, my_board_cells) 
{
    board_cells = my_board_cells;
    player_board_layout = my_player_board_layout;
    var board_layout_secrets = boardToSecret(board_cells);

    nebWrite("startOrJoinGame", [board_layout_secrets], function(resp) 
    {
        if(resp) 
        {
            $("#game_txhash").val(resp.txhash);
            pollUntilGameId();
        }
    });
}

function pollUntilGameId() 
{
    nebRead("getGameIdForTxhash", [$("#game_txhash").val()], function(result) 
    {
        if(result) 
        {
            $("#gameid").val(result);                                
            console.log("gameid is " + $("#gameid").val());
            on_start.fire();
            pollUntilOpponentConnected();
        } else 
        {
            setTimeout(pollUntilGameId, auto_refresh_interval);
        }
    });
}

function pollUntilOpponentConnected() 
{
    nebRead("hasOpponentConnectedForGameid", [$("#gameid").val()], function(result) 
    {
        if(result) 
        {
            console.log("opponent connected: " + result);
            on_opponent_connected.fire();
            pollUntilMyTurn();
        } else 
        {
            setTimeout(pollUntilOpponentConnected, auto_refresh_interval);
        }
    });
}

function pollUntilMyTurn() 
{
    nebRead("getTurnInfo", [$("#gameid").val()], function(result) 
    {
        if(result && result.you_won !== undefined) 
        { // Game over
            if(result.you_won)
            {
                console.log("You won!  Just one more transaction to prove you were not cheating.");
                confirmWinner();
            } 
            else if(!result.you_won && result.is_winner_confirmed)
            {
                console.log("You lost, and bad news... your opponent was not cheating.")
            } 
            else 
            {
                setTimeout(pollUntilMyTurn, auto_refresh_interval);                
            }
        }
        else if(result && result.is_my_turn && result.turn_counter > turn_counter) 
        {
            console.log("It's your turn, go go go!");
            turn_counter = result.turn_counter;
            target_x = result.target_x;
            target_y = result.target_y;
            if(target_x !== undefined) 
            {
                revealed_ships = result.revealed_ships;
                on_opponent_shot.fire();
            }
            last_shot_is_hit = result.last_shot_is_hit;
            on_my_turn.fire();
        } else
        {
            setTimeout(pollUntilMyTurn, auto_refresh_interval);
        }
    });
}

function makeMove(x, y) 
{ 
    nebWrite("makeMove", [$("#gameid").val(), x, y], function (resp) 
    {
        if(resp) 
        {
            on_my_turn_over.fire();
            console.log("Move submitted: " + resp.txhash);
            pollUntilMyTurn();
        }
    });
} 
 
function revealAndMakeMove(x, y) 
{ 
    var is_hit = board_cells[target_y][target_x] == 0 || board_cells[target_y][target_x] == 2 ? 0 : 1;
    var reveal_seed = board_seeds[target_x][target_y];
    var sunk_ship;
    if(board_cells[target_y][target_x] == 4) 
    {
        sunk_ship = findShipByCoords(target_x, target_y);
    }

    nebWrite("revealAndMakeMove", [$("#gameid").val(), x, y, is_hit, reveal_seed, sunk_ship], function(resp) 
    {
        if(resp) 
        {
            on_my_turn_over.fire();
            console.log("Reveal & Move submitted: " + resp.txhash);
            pollUntilMyTurn();
        }
    });
}

function concedeGame() {
    nebPay.call(contract_address, 0, "concedeGame", JSON.stringify([$("#gameid").val(), board_seeds, player_board_layout]), {
        listener: function(resp) {
            if(resp) {
                console.log("GG, tx for trying.");
                pollUntilMyTurn();
            }
        }
    });
}

function confirmWinner() {
    nebPay.call(contract_address, 0, "confirmWinner", JSON.stringify([$("#gameid").val(), board_seeds, player_board_layout]), {
        listener: function(resp) {
            if(resp) {
                console.log("GG.");
            }
        }
    });
}

function quitAndAcceptTheLoss() 
{
    nebPay.call(contract_address, 0, "quitAndAcceptTheLoss", JSON.stringify([]))
}

// Called by the Refresh button
function onClickRefresh() {
    nebPay.simulateCall(contract_address, 0, "getNumber", JSON.stringify([window.location.search.substr(1)]), {
        listener: function (resp) {
            var response = JSON.parse(resp.result);
            if(response) {
                $("#rng_request").show();
                $("#rng_request_pending").hide();

                $("#rng_request_number").text(response.number);
                $("#rng_request_max").text(response.max);
                $("#rng_request_data").text(response.data);
                $("#rng_request_date").text(new Date(response.date));
            }
        }
    });      
 }

// Called by the post button
function onClickRequestNumber() {
    nebPay.call(contract_address, 0, "requestNumber", JSON.stringify([$("#new_request_max").val(), $("#new_request_data").val()]), {
        listener: function (response) {
            window.location = location.protocol + '//' + location.host + location.pathname + '?' + response.txhash;
        }
    }); 
}

function shootAt(y, x)
{
    if(target_x === undefined) 
    {
        makeMove(x, y);
    } 
    else 
    {
        revealAndMakeMove(x, y);
    }
}

 



//on load, try to resume an existing game
nebRead("getTxHashForMyGameInProgress", null, function(result) 
{
    if(result) 
    {
        $("#game_txhash").val(result);
        console.log("game_txhash is " + $("#game_txhash").val());

        if(confirm("You have a game in-progress (" + $("#game_txhash").val() + "), do you want to cancel that game so you may start a new one?")) 
        {
            nebWrite("quitAndAcceptTheLoss");
        }
    } 
});


