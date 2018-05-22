"use strict";

var on_opponent_available_change = new Observable();
var on_start = new Observable();
var on_opponent_connected = new Observable();
var on_my_turn = new Observable();
var on_opponent_shot = new Observable();
var on_my_turn_over = new Observable();
var on_game_over = new Observable();

// Bug: if i concede when it's not my turn, the other guy does not get the memo.
// "Someone's waiting to play, right now!" should not show if that someone is you.
// claimTimeout - test confirm the second prompt does not happen
// Front bug: Resume on not my turn, thinks its my turn.  contract okay. 
//  - try repro
// - Front: poll for a concede which could happen anytime.  Test
// - Front: First land on page presents wallet issue. Test
// join private game - Test.  Plus front end messaging

// Front: status and options on the left / indicator of last refresh time
// Front: message on gas limit for end of game
// Front: allow resumbitting transactions like shoot 

//  visual indicator / effects for:
// - Hit
// - Miss
// - Sink
// - Win
// - Lose 
// - Front: Sound effects (with mute button)

// Give me money button: NAS, ether, BTC.  Link to the contract.  To GitHub, whitepaper  

var txhash;
var auto_refresh_interval = 3000; // 3 seconds
var opponent_connected;
var player_board_layout;
var board_cells;
var turn_counter = -1;
var targeted_cells;
var revealed_ships;
var is_my_turn;
var opponent_available;
var board_seeds;

function getGameId() 
{
    return window.location.hash.substring(1);
}

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

function getGameInfo() {
    nebPay.simulateCall(contract_address, 0, "getDataForGameId", JSON.stringify([getGameId()]), {
        listener: onGetGameInfo
    });
}

function onGetGameInfo(resp) {
    if(resp) {
        console.log(resp);
    }
}

function boardToHashes(board_cells) {
    board_seeds = new Array(10);
    for(var x = 0; x < 10; x++)
    {
        board_seeds[x] = new Array(10);
        for(var y = 0; y < 10; y++)
        {
            board_seeds[x][y] = sha256($("#secret").val() + x + y);
        }
    }

    var board_hashes = [];
    for(var x = 0; x < 10; x++) {
        board_hashes.push([]);
        for(var y = 0; y < 10; y++) {
            board_hashes[x].push(sha256((board_cells[y][x] == 0 ? 0 : 1) + board_seeds[x][y]));
        }                
    }
    return board_hashes;
}


function startGame(my_player_board_layout, my_board_cells) 
{
    board_cells = my_board_cells;
    player_board_layout = my_player_board_layout;
    var board_layout_secrets = boardToHashes(board_cells);
    
    if(getGameId()) 
    {
        txhash = getGameId();
        pollUntilGameId();
    } 
    else 
    {
        nebWrite("startOrJoinGame", [board_layout_secrets, $("#private-game-checkbox").prop('checked')], function(resp) 
        {
            if(resp) 
            {
                txhash = resp.txhash;
                pollUntilGameId();
            }
        });
    }
}

function pollUntilGameId() 
{
    nebRead("getGameIdForTxHash", [txhash], function(result) 
    {
        if(result) 
        {
            window.location.hash = result;                            
            console.log("game_id is " + getGameId());
            on_start.fire();
            pollUntilMyTurn();
        } else 
        {
            setTimeout(pollUntilGameId, auto_refresh_interval);
        }
    });
}

function pollUntilMyTurn() 
{
    nebRead("getTurnInfo", [getGameId()], function(result) 
    {
        if(result && result.you_won !== undefined) 
        { // Game over
            if(result.you_won)
            {
                if(!result.is_winner_confirmed)
                {
                    console.log("You won!  Just one more transaction to prove you were not cheating.");
                    confirmWinner();
                }
                else 
                {
                    console.log("GG"); 
                }
                on_game_over.fire();                
            } 
            else if(!result.you_won && result.is_winner_confirmed)
            {
                console.log("You lost, and bad news... your opponent was not cheating.");
                on_game_over.fire();
            } 
            else 
            {
                setTimeout(pollUntilMyTurn, auto_refresh_interval);                
            }
        }
        else 
        {
            if(result)
            {
                revealed_ships = result.revealed_ships;
                targeted_cells = result.targeted_cells;
                is_my_turn = result.is_my_turn;
            }

            if(result && !opponent_connected && result.has_opponent_connected)
            {
                console.log("opponent connected: " + result);
                opponent_connected = 1;
                on_opponent_connected.fire();
            }

            if(result && result.is_my_turn && result.targeted_cells.length > turn_counter) 
            {
                console.log("It's your turn, go go go!");
                turn_counter = result.targeted_cells.length;
                if(result.target_x !== undefined) 
                {
                    on_opponent_shot.fire(parseInt(result.target_x), parseInt(result.target_y));
                }
                on_my_turn.fire();
            } 
            else
            {
                if(result)
                {
                    var is_timeout = result.time_till_timeout < 0;
                    if(result.is_my_turn)
                    {
                        is_timeout = false;
                    }
                    if(is_timeout)
                    {
                        $("#is-timeout").show();
                    } 
                    else 
                    {
                        $("#is-timeout").hide();                    
                    }
                }

                setTimeout(pollUntilMyTurn, auto_refresh_interval);
            }
        }
    });
}

function makeMove(x, y) 
{ 
    nebWrite("makeMove", [getGameId(), x, y], function (resp) 
    {
        if(resp) 
        {
            on_my_turn_over.fire();
            console.log("Move submitted: " + resp.txhash);
            pollUntilMyTurn();
        }
    });
} 
 
function revealAndMakeMove(x, y, target_x, target_y) 
{ 
    var is_hit = board_cells[target_y][target_x] == 0 || board_cells[target_y][target_x] == 2 ? 0 : 1;
    var reveal_seed = board_seeds[target_x][target_y];
    var sunk_ship;
    if(board_cells[target_y][target_x] == 4) 
    {
        sunk_ship = findShipByCoords(target_x, target_y);
    }

    nebWrite("revealAndMakeMove", [getGameId(), x, y, is_hit, reveal_seed, sunk_ship], function(resp) 
    {
        if(resp) 
        {
            on_my_turn_over.fire();
            console.log("Reveal & Move submitted: " + resp.txhash);
            pollUntilMyTurn();
        }
    });
}

function gameOverILost() {
    nebPay.call(contract_address, 0, "gameOverILost", JSON.stringify([getGameId(), board_seeds, player_board_layout]), 
    {
        listener: function(resp) 
        {
            if(resp) 
            {
                console.log("GG, tx for trying.");
                pollUntilMyTurn();
            }
        }
    });
}

function confirmWinner() {
    nebPay.call(contract_address, 0, "confirmWinner", JSON.stringify([getGameId(), board_seeds, player_board_layout]), {
        listener: function(resp) {
            if(resp) {
                console.log("GG.");
            }
        }
    });
}

function shootAt(y, x)
{
    if(!targeted_cells || targeted_cells.length == 0) 
    {
        makeMove(x, y);
    } 
    else 
    {
        var target = targeted_cells[targeted_cells.length - 1];
        revealAndMakeMove(x, y, target.x, target.y);
    }
}

function collectWinFromTimout()
{
    nebWrite("collectWinFromTimout", [getGameId(), board_seeds, player_board_layout], function(resp) 
    {
        if(resp)
        {
            console.log("Cashing in on that timeout now... " + resp);
        }
    });
}

var rawFile = new XMLHttpRequest();
rawFile.open("GET", 'english_words.txt');
rawFile.onreadystatechange = function ()
{
    if(rawFile.readyState === 4)
    {
        if(rawFile.status === 200 || rawFile.status == 0)
        {
            var allText = rawFile.responseText;
            var phrase = "";
            for(var i = 0; i < 12; i++)
            {
                var lines = allText.split('\n');
                var random_id = Math.floor(Math.random() * lines.length);
                var line = lines[random_id];
                if(i > 0)
                {
                    phrase += " ";
                }
                phrase += line;
            }
            $("#secret").val(phrase);
        }
    }
}
rawFile.send(null);




function cancelGame() 
{
    nebWrite("cancelGameWhichHasNotStarted", [getGameId()], function() 
    {
        var href = window.location.href;
        var dir = href.substring(0, href.lastIndexOf('/')) + "/";
        window.location =  dir;  
    });
}


