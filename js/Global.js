// Global variables used by our Dapp
var contract_address;

var is_mainnet = true;
var nebulas_chain_id, nebulas_domain; 
var gas_price = 1000000;
var gas_limit = 200000;

if(is_mainnet) 
{
    nebulas_chain_id = 1;
    nebulas_domain = "https://mainnet.nebulas.io";
    contract_address = "n1syvnhxWEe53Q56ZATUtFWNy3bxHLx1n8b";
} 
else 
{
    nebulas_chain_id = 1001;
    nebulas_domain = "https://testnet.nebulas.io";
    contract_address = "n1xvG8CQFnhjpE6GVREUPHEH5zuWCRWUyzP";
}

var token_divider = 1000000000000000000;

// Events
var on_board_layout_complete = new Observable();
var on_transaction = new Observable();
var on_opponent_available_change = new Observable();
var on_start_requested = new Observable();
var on_start = new Observable();
var on_opponent_connected = new Observable();
var on_my_turn = new Observable();
var on_opponent_shot = new Observable();
var on_turn_change = new Observable();
var on_my_turn_over = new Observable();
var on_game_over = new Observable();
var on_concede = new Observable();
var on_i_appear_to_have_lost = new Observable();
var on_i_appear_to_have_won = new Observable();

// Public data
var txhash;
var auto_refresh_interval = 3000; // 3 seconds
var has_game_started;
var opponent_connected;
var player_board_layout;
var board_cells;
var turn_counter = -1;
var targeted_cells;
var revealed_ships;
var is_my_turn;
var opponent_available;
var board_seeds;


function redirectToGame()
{
    var href = window.location.href;
    var dir = href.substring(0, href.lastIndexOf('/')) + "/Game.html";
    window.location =  dir;  
}

function formatCoins(number) 
{
    var factor = Math.pow(10, 2);
    var x = Math.round(number / token_divider * factor) / factor;
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}