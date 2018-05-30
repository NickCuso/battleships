"use strict";

// Public Write methods
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
        nebWrite("startOrJoinGame", [board_layout_secrets], function(resp) 
        {
            if(resp) 
            {
                txhash = resp.txhash;
                has_game_started = true;
                pollUntilGameId();
                on_start_requested.fire();
            }
        });
    }
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

function cancelGame() 
{
    nebWrite("cancelGameWhichHasNotStarted", [getGameId()], function() 
    {
        redirectToGame();
    });
}

function gameOverILost() 
{
    on_concede.fire();
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
                pollUntilMyTurn();
            }
        }
    });
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

// Private Write

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

// Public read only
function getGameId() 
{
    return window.location.hash.substring(1);
}

// Network stuff
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
        } 
        else 
        {
            setTimeout(pollUntilGameId, auto_refresh_interval);
        }
    });
}

var deadline;

function startCountdown() 
{
    var x = setInterval(function() {
        $("#shot-clock-expired-my-turn").hide();
        
        if(!deadline)
        {
            $("#shot-clock").hide();      
            return;  
        }
    
        var now = new Date().getTime();
        var t = deadline - now;
        var seconds = Math.floor((t % (1000 * 60)) / 1000);
        $("#shot-clock").show();        
        
        $("#shot-clock").text(seconds + " secs");
            if (t < 0) 
            {
                $("#shot-clock").hide();      
                if(is_my_turn)
                {
                    $("#shot-clock-expired-my-turn").show();
                }
            }
    }, 300);
}
startCountdown();

function pollUntilMyTurn() 
{
    nebRead("getTurnInfo", [getGameId()], function(result, error) 
    {
        $("#is-timeout").hide();
        deadline = null;

        if(error == "Call: Error: You are not in the game!")
        {
            redirectToGame();
            return;
        }

        if(result)
        {
            my_player_id = result.my_player_id;
            revealed_ships = result.revealed_ships;
            targeted_cells = result.targeted_cells;
        }

        if(result && result.you_won !== undefined) 
        { // Game over
            if(result.you_won)
            {
                if(!result.is_winner_confirmed)
                {
                    console.log("You won!  Just one more transaction to prove you were not cheating.");
                    on_i_appear_to_have_won.fire();
                }
                else 
                {
                    console.log("GG"); 
                    on_game_over.fire(result.you_won);                
                }
            } 
            else if(!result.you_won && result.is_winner_confirmed)
            {
                console.log("You lost, and bad news... your opponent was not cheating.");
                on_game_over.fire(result.you_won);
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
                if(is_my_turn != result.is_my_turn)
                { // Turn just changed
                    is_my_turn = result.is_my_turn;
                    on_turn_change.fire();
                }

                if(result.has_opponent_connected)
                {
                    deadline = Date.now() + result.time_till_timeout;
                }
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
                if(result && opponent_connected)
                {
                    var is_timeout = result.time_till_timeout < 0;
                    if(result.is_my_turn)
                    {
                        is_timeout = false;
                    }
                }

                setTimeout(pollUntilMyTurn, auto_refresh_interval);
            }
        }

        if(is_timeout && !result.is_winner_confirmed)
        {
            $("#is-timeout").show();
        } 
    });
}

// Private read only
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

$("#play-now-div").hide();
