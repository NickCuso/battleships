//#region Intro
// youtube.com/HardlyDifficult
// Built for Nebulas by HardlyDifficult.  

////////////////////////
// About the NEP5 code:

// Copyright (C) 2017 go-nebulas authors
//
// This file is part of the go-nebulas library.
//
// the go-nebulas library is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// the go-nebulas library is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with the go-nebulas library.  If not, see <http://www.gnu.org/licenses/>.
//
////////////////////////
//#endregion

//#region "Allowed" for the token implementation
var Allowed = function (obj) {
    this.allowed = {};
    this.parse(obj);
}

Allowed.prototype = {
    toString: function () {
        return JSON.stringify(this.allowed);
    },

    parse: function (obj) {
        if (typeof obj != "undefined") {
            var data = JSON.parse(obj);
            for (var key in data) {
                this.allowed[key] = new BigNumber(data[key]);
            }
        }
    },

    get: function (key) {
        return this.allowed[key];
    },

    set: function (key, value) {
        this.allowed[key] = new BigNumber(value);
    }
}
//#endregion

//#region Smart Contract Data
// This section defines all the data stored by this smart contract.
var BattleshipsContract = function() 
{
    // There is 0 or 1 game pending for public matchmaking.  
    // If pending, when another person connects they join that game.
    LocalContractStorage.defineProperty(this, "pending_game_id");

    // game_id is the txhash which created the game, there is also a txhash for the person who joined that game.
    LocalContractStorage.defineMapProperty(this, "txhash_to_game_id"); 
    
    // Each game, both in progress and historic, has the following data.
    // Data: {
    //  date_started, current_player_id, date_last_action,
    //  targeted_cells: [{player_id, x, y, is_hit}],
    //  winner_id, is_winner_confirmed
    //  player[0/1]: {addr, board_hashes, revealed_seeds, revealed_ships: [{name, start_x, start_y, is_horizontal}]},
    //}
    LocalContractStorage.defineMapProperty(this, "game_id_to_data"); 

    // Tracks stats for every completed game.
    // Stats: {start, win, lose, timeout, move}
    LocalContractStorage.defineMapProperty(this, "addr_to_stats");

    // An array of users 
    LocalContractStorage.defineProperty(this, "all_users");

    // Current winner payout amount
    LocalContractStorage.defineProperty(this, "next_payout",  {
        parse: function (value) {
            return new BigNumber(value);
        },
        stringify: function (o) {
            return o.toString(10);
        }});

    ////////////////
    // Token Support
    ////////////////
    LocalContractStorage.defineProperties(this, {
        _name: null,
        _symbol: null,
        _decimals: null,
        _totalSupply: {
            parse: function (value) {
                return new BigNumber(value);
            },
            stringify: function (o) {
                return o.toString(10);
            }
        }
    });

    LocalContractStorage.defineMapProperties(this, {
        "balances": {
            parse: function (value) {
                return new BigNumber(value);
            },
            stringify: function (o) {
                return o.toString(10);
            }
        },
        "allowed": {
            parse: function (value) {
                return new Allowed(value);
            },
            stringify: function (o) {
                return o.toString();
            }
        }
    });
}
//#endregion Smart Contract Data

BattleshipsContract.prototype = 
{
    //#region Public Write Methods
    init: function() 
    {
        this.all_users = "";

        // Token init
        this._name = "Shipcoin";
        this._symbol = "SHC";
        this._decimals = 18;
        this._totalSupply = new BigNumber(1000000).mul(new BigNumber(10).pow(this._decimals));

        this.next_payout = new BigNumber(42).mul(new BigNumber(10).pow(this._decimals));

        var from = Blockchain.transaction.from;
        this.balances.set(from, this._totalSupply);
        this.transferEvent(true, from, from, this._totalSupply);
    },
    
    // A user lays out their board, selects a random secret for each cell, then calculates the hash for each cell.
    // board_hashes is an array such that board_hashes[cell_x][cell_y] == sha256(has_ship + cell_secret).
    // This data is used to prove you did not change anything after the game began, without allowing your opponent to 
    // see your board on the blockchain.
    //
    // The first call creates a new game, the next joins that game... then repeat.
    startOrJoinGame: function(board_hashes) 
    {
        if(this.pending_game_id) 
        { // Join game
            var game_id = this.pending_game_id;
            this.pending_game_id = null;

            var data = this.getDataForGameId(game_id);
            if(data.player[0].addr != Blockchain.transaction.from)
            { 
                player_id = 1;
                
                var data = this.getDataForGameId(game_id);
                data.current_player_id = Math.floor(Math.random() * 2); // 0 or 1
                addPlayerToGame(this, game_id, data, player_id, board_hashes);    
                return;
            }

            // If you started the pending game, this new game request will replace the original.
        }      

        { // New game
            var game_id = Blockchain.transaction.hash;
            this.pending_game_id = game_id;
            
            var player_id = 0;
            
            var data = {};
            data.date_started = Date.now();
            data.player = [];
            data.targeted_cells = [];

            addPlayerToGame(this, game_id, data, player_id, board_hashes);
        }          
    },
    
    // This is only called for the very first action in a game, otherwise use revealAndMakeMove.
    // Targets the specified cell.
    makeMove: function(game_id, x, y) 
    {
        var data = this.getDataForGameId(game_id);
        assertFirstMoveOfGame(data);

        makeMoveAfterAsserts(this, game_id, data, x, y);
    },

    // Called anytime you make a move, other than the first move of the game.
    // Reveals information about the cell your opponent previously targeted by sharing the seed
    // used to create the hash that you published at startOrJoinGame.
    // If you lie about the seed, this transaction will fail.
    //
    // sunk_ship is included if your opponent just sunk one of your ships.
    // If you fail to announce a sunk_ship, we will detect that later and you will lose the game.
    //
    // Once reveal is complete, this does a makeMove like above.
    revealAndMakeMove: function(game_id, x, y, is_hit, reveal_seed, sunk_ship) 
    {         
        var data = this.getDataForGameId(game_id);
        assertNotFirstMoveOfGame(data);

        var current_player = data.player[data.current_player_id];
        var target = data.targeted_cells[data.targeted_cells.length - 1];
        validateCellReleave(current_player, target.x, target.y, is_hit, reveal_seed);
        validateSunkShip(current_player, sunk_ship, target.x, target.y);
        target.is_hit = is_hit;

        makeMoveAfterAsserts(this, game_id, data, x, y);
    },

    // When a game of Battleships is over, the loser will notice this first.
    // When the loser detects a loss, gameOverILost is called. 
    // You may still win after calling gameOverILost 
    // (if you opponent was cheating they will be forced into a timeout).
    gameOverILost: function(game_id) 
    {
        var data = this.getDataForGameId(game_id);
        assertImInGame(data);
        assertGameInProgress(data);

        var player_id;
        if(data.player[0].addr == Blockchain.transaction.from) 
        {
            player_id = 0;
        }
        else if(data.player[1].addr == Blockchain.transaction.from)
        {
            player_id = 1; 
        } 
        else
        {
            throw new Error("You are not part of that game");
        }

        data.winner_id = otherPlayer(player_id);
        data.current_player_id = data.winner_id;
        data.date_last_action = Date.now();

        this.game_id_to_data.put(game_id, data); // save changes
    },

    // Once the loser has called gameOverILost, the winner completes the game
    // by proving that they were not cheating.  If the winner was cheating
    // then they will not be able to confirm, and the loser can claim the win after a timeout.
    confirmWinner: function(game_id, board_seeds, board_layout) 
    {
        var data = this.getDataForGameId(game_id);
        assertIsMyTurn(data);
        assertGameIsOver(data);
        assertGameNotConfirmed(data);
        assertIWon(data);        
        
        var player_id = data.current_player_id;
        var player = data.player[player_id];

        validateBoardReveal(player, board_seeds, board_layout);

        data.is_winner_confirmed = 1;

        recordStats(this, data);

        this.game_id_to_data.put(game_id, data); // save changes
    },

    // If a player stops responding then you can claim a win after a timeout.
    // If a player cheats, they will get stuck and the other player can claim 
    // a win using this method.
    //
    // In order to collect a win here you must prove you were not cheating.
    //
    // If both players cheat, the game will stay pending forever.
    collectWinFromTimout: function(game_id, board_seeds, board_layout) 
    {
        if(!this.hasTimeoutPassedForGameId(game_id)) 
        {
            throw new Error("Too soon..");
        }

        var data = this.getDataForGameId(game_id);
        assertIsNotMyTurn(data); 
        assertGameNotConfirmed(data);        
        var player_id = otherPlayer(data.current_player_id); 
        var player = data.player[player_id];

        validateBoardReveal(player, board_seeds, board_layout);

        data.winner_id = player_id; 
        data.is_winner_confirmed = 1;

        recordStats(this, data, true);
        
        this.game_id_to_data.put(game_id, data); // save changes
    },

    cancelGameWhichHasNotStarted: function(game_id)
    {
        var data = this.getDataForGameId(game_id);
        assertImInGame(data);
        assertPlayerSlotIsAvailable(data, 1);

        this.txhash_to_game_id.del(game_id);
        this.game_id_to_data.del(game_id);

        if(this.pending_game_id == game_id)
        {
            this.pending_game_id = null;
        }
    },
    //#endregion Public Write Methods

    //#region Public Read-Only Methods
    getGameIdForTxHash: function(txhash)
    {
        var game_id = this.txhash_to_game_id.get(txhash);
        if(game_id == null)
        {
            throw new Error("Txhash not found: " + txhash);
        }
        return game_id;
    },

    // Gets all the information about a game.
    getDataForGameId: function(game_id) 
    {
        var data = this.game_id_to_data.get(game_id);
        if(!data) 
        {
            throw new Error("Data not found.. for game_id: " + game_id);
        }
        return data;
    },

    // This is the main method the client uses to monitor the game for updates.
    getTurnInfo: function(game_id) 
    {
        var data = this.getDataForGameId(game_id);
        assertImInGame(data);

        var my_player_id = data.player[0].addr == Blockchain.transaction.from ? 0 : 1;

        if(data.winner_id != null)
        {
            return {
                my_player_id,
                time_till_timeout: this.timeTillTimeout(data),
                you_won: data.player[data.winner_id].addr == Blockchain.transaction.from,
                is_winner_confirmed: data.is_winner_confirmed
            };
        }
        else 
        {
            var has_opponent_connected = data.player[0] != null && data.player[1] != null;
            var is_my_turn = false;
            if(has_opponent_connected)
            {
                is_my_turn = data.player[data.current_player_id].addr == Blockchain.transaction.from;
            }
            var target = null;
            if(data.targeted_cells.length > 0)
            {
                target = data.targeted_cells[data.targeted_cells.length - 1];
            }

            var other_player_id = is_my_turn ? otherPlayer(data.current_player_id) : data.current_player_id;

            return { 
                my_player_id,
                has_opponent_connected,
                is_my_turn,
                time_till_timeout: this.timeTillTimeout(data),
                target_x: target == undefined ? undefined : target.x, 
                target_y: target == undefined ? undefined : target.y, 
                targeted_cells: data.targeted_cells,
                revealed_ships: has_opponent_connected ? data.player[other_player_id].revealed_ships : null
            };
        }
    },

    // Leave addr null to get your stats.
    getStatsForUser: function(addr)
    {
        if(!addr)
        {
            addr = Blockchain.transaction.from
        }
        var stats = this.addr_to_stats.get(addr);
        stats.balance = this.balanceOf(addr);

        return stats;
    },

    // Can follow up with getStatsForUser calls to create a leaderboard clientside.
    getAllUsersWithStats: function()
    {
        return this.all_users;
    },

    timeTillTimeout: function(data)
    {
        return 1000 * 45 - (Date.now() - data.date_last_action); // 45 seconds
    },

    hasTimeoutPassedForGameId: function(game_id)
    {
        var data = this.getDataForGameId(game_id);
        return this.timeTillTimeout(data) < 0;
    },

    // Returns server status information
    getPendingGameId: function()
    {
        return this.pending_game_id;
    },

    // This is how much the next winner will receive 
    getNextPayoutAmount: function()
    {
        return getPayoutAmount(this);
    },
    //#endregion Public Read-Only Methods    

    //#region Token Logic
    // Returns the name of the token
    name: function () {
        return this._name;
    },

    // Returns the symbol of the token
    symbol: function () {
        return this._symbol;
    },

    // Returns the number of decimals the token uses
    decimals: function () {
        return this._decimals;
    },

    totalSupply: function () {
        return this._totalSupply.toString(10);
    },

    myBalance: function()
    {
        return this.balanceOf(Blockchain.transaction.from);
    },

    balanceOf: function (owner) {
        var balance = this.balances.get(owner);

        if (balance instanceof BigNumber) {
            return balance.toString(10);
        } else {
            return "0";
        }
    },

    transfer: function (to, value) {
        value = new BigNumber(value);
        if (value.lt(0)) {
            throw new Error("invalid value.");
        }

        var from = Blockchain.transaction.from;
        var balance = this.balances.get(from) || new BigNumber(0);

        if (balance.lt(value)) {
            throw new Error("transfer failed.");
        }

        this.balances.set(from, balance.sub(value));
        var toBalance = this.balances.get(to) || new BigNumber(0);
        this.balances.set(to, toBalance.add(value));

        this.transferEvent(true, from, to, value);
    },

    transferFrom: function (from, to, value) {
        var spender = Blockchain.transaction.from;
        var balance = this.balances.get(from) || new BigNumber(0);

        var allowed = this.allowed.get(from) || new Allowed();
        var allowedValue = allowed.get(spender) || new BigNumber(0);
        value = new BigNumber(value);

        if (value.gte(0) && balance.gte(value) && allowedValue.gte(value)) {

            this.balances.set(from, balance.sub(value));

            // update allowed value
            allowed.set(spender, allowedValue.sub(value));
            this.allowed.set(from, allowed);

            var toBalance = this.balances.get(to) || new BigNumber(0);
            this.balances.set(to, toBalance.add(value));

            this.transferEvent(true, from, to, value);
        } else {
            throw new Error("transfer failed.");
        }
    },

    transferEvent: function (status, from, to, value) {
        Event.Trigger(this.name(), {
            Status: status,
            Transfer: {
                from: from,
                to: to,
                value: value
            }
        });
    },

    approve: function (spender, currentValue, value) {
        var from = Blockchain.transaction.from;

        var oldValue = this.allowance(from, spender);
        if (oldValue != currentValue.toString()) {
            throw new Error("current approve value mistake.");
        }

        var balance = new BigNumber(this.balanceOf(from));
        var value = new BigNumber(value);

        if (value.lt(0) || balance.lt(value)) {
            throw new Error("invalid value.");
        }

        var owned = this.allowed.get(from) || new Allowed();
        owned.set(spender, value);

        this.allowed.set(from, owned);

        this.approveEvent(true, from, spender, value);
    },

    approveEvent: function (status, from, spender, value) {
        Event.Trigger(this.name(), {
            Status: status,
            Approve: {
                owner: from,
                spender: spender,
                value: value
            }
        });
    },

    allowance: function (owner, spender) {
        var owned = this.allowed.get(owner);

        if (owned instanceof Allowed) {
            var spender = owned.get(spender);
            if (typeof spender != "undefined") {
                return spender.toString(10);
            }
        }
        return "0";
    }
    //#endregion
}

module.exports = BattleshipsContract

//#region Private Write Methods

function addPlayerToGame(contract, game_id, data, player_id, board_hashes) 
{
    assertPlayerSlotIsAvailable(data, player_id);
    assertGameInProgress(data);

    data.player[player_id] = {};
    data.player[player_id].addr = Blockchain.transaction.from;
    data.player[player_id].board_hashes = board_hashes;
    data.player[player_id].revealed_seeds = emptyBoardSizedArray();
    data.player[player_id].revealed_ships = [];
    
    data.date_last_action = Date.now();

    contract.txhash_to_game_id.put(Blockchain.transaction.hash, game_id);
    contract.game_id_to_data.put(game_id, data);

    recordStatsForPlayer(contract, Blockchain.transaction.from, 'start');
}

function addShip(player_board_cells, ship) 
{
    if(!ship)
    {
        throw new Error("Missing ship reveal");
    }

    var x = ship.start_x;
    var y = ship.start_y;
    
    for(var i = 0; i < ship.length; i++) 
    {
        assertValidCell(x, y);
        assertCellIsEmpty(player_board_cells, x, y);

        player_board_cells[x][y] = 1;

        if(ship.is_horizontal) 
        {
            x++;
        } else 
        {
            y++;
        }
    }
}

function emptyBoardSizedArray() 
{
    var array = new Array(10);
    for(var i = 0; i < 10; i++) 
    {
        array[i] = new Array(10);
    }
    
    return array;
}

function makeMoveAfterAsserts(contract, game_id, data, x, y) 
{
    assertGameInProgress(data);    
    assertValidCell(x, y);
    assertIsMyTurn(data);

    var other_player_id = otherPlayer(data.current_player_id);
    assertCellNotRevealed(data, other_player_id, x, y);

    data.targeted_cells.push({
        player_id: data.current_player_id, 
        x, 
        y
    });
    data.current_player_id = other_player_id;

    data.date_last_action = Date.now();     
    contract.game_id_to_data.put(game_id, data); // Save changes

    recordStatsForPlayer(contract, Blockchain.transaction.from, 'move');    
}

// Updates stats for both players of a game which recently completed.
function recordStats(contract, data, was_timeout) 
{
    recordStatsFor(contract, data, was_timeout, 0);
    recordStatsFor(contract, data, was_timeout, 1);
}

function recordStatsFor(contract, data, was_timeout, player_id)
{
    var stat_type;
    if(data.winner_id == player_id) 
    {
        stat_type = 'win';

        var payout_amount = new BigNumber(getPayoutAmount(contract));
        if(was_timeout)
        { // Winners from a timeout only get 10%
            payout_amount = payout_amount.mul(.1);
        }
        transferFromContractToUser(contract, Blockchain.transaction.from, payout_amount);
        // Increase payout by .1% with each game
        if(!was_timeout)
        {
            contract.next_payout = contract.next_payout.mul(1.001);
        }
    } 
    else if(was_timeout) 
    { // Losers from a timeout get NOTHING!
        stat_type = 'timeout';
    } 
    else 
    {
        stat_type = 'lose';

        // Losers which don't simply rage quit get 1%
        var payout_amount = new BigNumber(getPayoutAmount(contract));
        payout_amount = payout_amount.mul(.01);
        transferFromContractToUser(contract, data.player[player_id].addr, payout_amount);
    }
    recordStatsForPlayer(contract, data.player[player_id].addr, stat_type);
}

// stat_type == start | win | lose | timeout | move
function recordStatsForPlayer(contract, addr, stat_type)
{
    var stats = contract.addr_to_stats.get(addr);
    if(!stats) 
    {
        contract.all_users += addr + ",";
        stats = {start: 0, win: 0, lose: 0, timeout: 0, move: 0};
    }

    stats[stat_type]++;

    contract.addr_to_stats.put(addr, stats);
}

function transferFromContractToUser(contract, to, value)
{
    if (value.lt(0)) {
        throw new Error("invalid value.");
    }

    var from = Blockchain.transaction.to;
    var balance = contract.balances.get(from) || new BigNumber(0);

    if (balance.lt(value)) {
        throw new Error("transfer failed.");
    }

    contract.balances.set(from, balance.sub(value));
    var toBalance = contract.balances.get(to) || new BigNumber(0);
    contract.balances.set(to, toBalance.add(value));

    contract.transferEvent(true, from, to, value);
}

//#endregion Private Write Methods

//#region Private Read-Only Methods

function otherPlayer(playerid) 
{
    return playerid == 0 ? 1 : 0;
}

function validateCellReleave(player, x, y, is_hit, reveal_seed) 
{ 
    if(!is_hit) 
    {
        is_hit = 0;
    }

    var hash = sha256(is_hit + reveal_seed);
    var expected_cell_hash = player.board_hashes[x][y];
    if(hash != expected_cell_hash) 
    {
        throw new Error("Invalid reveal seed for cell (" + x + ", " + y + "), is_hit: " + is_hit 
            + ", reveal_seed: " + reveal_seed + ", expected hash: " + expected_cell_hash + ", calculated hash: " + hash);
    }

    var previous_submission = player.revealed_seeds[x][y];
    if(previous_submission && previous_submission != reveal_seed) 
    {
        throw new Error("That's not what you said before - LIAR!!!");
    }

    player.revealed_seeds[x][y] = reveal_seed;
}

function validateSunkShip(player, sunk_ship, x, y) 
{
    if(sunk_ship) 
    {
        var ship_includes_cell = false;
        var any_cell_not_revealed = false;
        var ship_x = sunk_ship.start_x;
        var ship_y = sunk_ship.start_y;
        for(var i = 0; i < sunk_ship.length; i++)
        {
            if(ship_x == x && ship_y == y)
            {
                ship_includes_cell = true;
            }
            else 
            {
                if(player.revealed_seeds[ship_x][ship_y] == null)
                {
                    any_cell_not_revealed = true;
                }
            }
            if(sunk_ship.is_horizontal)
            {
                ship_x++;
            }
            else 
            {
                ship_y++;
            }
        }
        if(any_cell_not_revealed)
        { 
            throw new Error("You shared a ship but it appears that ship is not sunk yet. Player: " + JSON.stringify(player) 
                + "; sunk_ship: " + JSON.stringify(sunk_ship) + "; cell: (" + x + ", " + y + ")");
        }
        if(ship_includes_cell == false)
        {
            throw new Error("The ship you reported as just sunk was hit last... what you doing?  Cheater!");
        }

        if(player.revealed_ships.length > 4) 
        {
            throw new Error("Too many ship reveals...");
        }

        player.revealed_ships.push(sunk_ship);
    }
}

function validateBoardReveal(player, board_seeds, board_layout) 
{
    // confirm board is a valid layout
    // send in start and rotation.  place each into a 2d array, if overlap or out of bounds you cheated.
    var player_board_cells = emptyBoardSizedArray();

    addShip(player_board_cells, board_layout.carrier);
    addShip(player_board_cells, board_layout.battleship);
    addShip(player_board_cells, board_layout.cruiser);
    addShip(player_board_cells, board_layout.submarine);
    addShip(player_board_cells, board_layout.destroyer);

    for(var i = 0; i < player.revealed_ships.length; i++)
    {
        var revealed_ship = player.revealed_ships[i];
        var real_ship = board_layout[revealed_ship.name];
        if(!real_ship) 
        {
            throw new Error("I couldn't find the revealed ship " + revealed_ship.name);
        }
        if(real_ship.start_x !== revealed_ship.start_x
            || real_ship.start_y !== revealed_ship.start_y
            || real_ship.length !== revealed_ship.length
            || real_ship.is_horizontal !== revealed_ship.is_horizontal)
        {
            throw new Error("Previously revealed ship does not match what you just submitted.  Previously: " + revealed_ship + " and now " + real_ship);
        }
    }
    
    // On confirm: any not declared have an uncovered cell remaining.
    var keys = Object.keys(board_layout);
    for(var i_ship = 0; i_ship < keys; i_ship++)
    {
        var key = keys[i];
        var was_ship_revealed = false;
        for(var i = 0; i < player.revealed_ships.length; i++)
        {
            if(player.revealed_ships[i].name == key)
            {
                was_ship_revealed = true;
                break;
            }
        }
        if(!was_ship_revealed)
        {
            var any_cell_not_revealed = false;
            var ship = board_layout[key];
            var x = ship.start_x;
            var y = ship.start_y;
            for(var i = 0; i < ship.length; i++)
            {
                if(player.revealed_seeds[x][y] !== undefined)
                {
                    any_cell_not_revealed = true;
                    break;
                }
                if(ship.is_horizontal)
                {
                    x++;
                }
                else 
                {
                    y++;
                }
            }
            if(!any_cell_not_revealed)
            {
                throw new Error("You did not reveal when a ship was sunk.  Cheater!");
            }
        }
    }

    for(var x = 0; x < 10; x++) 
    {
        for(var y = 0; y < 10; y++) 
        {
            var seed = board_seeds[x][y];

            // Confirm all previous reveals are included
            var previous_seed = player.revealed_seeds[x][y];
            if(previous_seed && seed != previous_seed) 
            {
                throw new Error("Seed for cell (" + x + ", " + y + ") does not match the seed you shared previously. Was " 
                    + previous_seed + ", now " + seed);
            }
            
            // Confirm seeds for all hits
            var is_hit = player_board_cells[x][y];
            if(is_hit) 
            {
                validateCellReleave(player, x, y, is_hit, seed);
            }
        }
    }
}

function getPayoutAmount(contract)
{
    var balance = contract.balances.get(Blockchain.transaction.to) || new BigNumber(0);    

    var payout = contract.next_payout;
    if(payout.gt(balance))
    {
        payout = balance;
    }
    if(payout.lte(0))
    {
        throw new Error("Airdrop complete, thanks for playing!");
    }

    return payout.toString(10);
}
//#endregion Private Read-Only Methods

//#region Asserts
function assertIsMyTurn(data) 
{
    assertImInGame(data);
    
    if(data.player[data.current_player_id].addr != Blockchain.transaction.from)
    {
        throw new Error("Not your turn, sit tight.");
    }
}

function assertImInGame(data)
{
    if(data.player[0].addr != Blockchain.transaction.from
        && (!data.player[1] || data.player[1].addr != Blockchain.transaction.from))
    {
        throw new Error("You are not in the game!");        
    }
}

function assertIsNotMyTurn(data) 
{
    assertImInGame(data);

    if(data.player[data.current_player_id].addr == Blockchain.transaction.from)
    {
        throw new Error("It's your turn...");
    }
}

function assertCellIsEmpty(player_board_cells, x, y) 
{
    if(player_board_cells[x][y]) 
    {
        throw new Error("Overlapping ships, CHEATER!");
    }
}

function assertGameInProgress(data)
{
    if(data.winner_id != null) 
    {
        throw new Error("That game is ending or already over.")
    }
}

function assertFirstMoveOfGame(data)
{
    if(data.targeted_cells.length > 0) 
    {
        throw new Error("This is not the first move. Call revealAndMakeMove instead.");
    }
}

function assertPlayerSlotIsAvailable(data, player_id)
{
    if(data.player[player_id])
    {
        throw new Error("That player slot has already been filled.  player_id: " + player_id);
    }
}

function assertNotFirstMoveOfGame(data)
{
    if(data.targeted_cells.length == 0) 
    {
        throw new Error("This is the first move of the game. Call makeMove instead.");
    }
}

function assertGameIsOver(data)
{
    if(data.winner_id == null) 
    {
        throw new Error("Game is not over yet.");
    }
}

function assertGameNotConfirmed(data)
{
    if(data.is_winner_confirmed) 
    {
        throw new Error("Game is already over and confirmed, don't waste the gas.");
    }
}

function assertValidCell(x, y) 
{
    if(x < 0 || x >= 10 || y < 0 || y >= 10) 
    {
        throw new Error("Cell is not valid, you selected (" + x + ", " + y + ").");
    }
}

function assertIWon(data)
{
    if(data.player[data.winner_id].addr != Blockchain.transaction.from) 
    {
        throw new Error("You didn't win, get outa here.");
    }
}

function assertCellNotRevealed(data, player_id, x, y)
{
    var player = data.player[player_id];
    if(player.revealed_seeds[x][y]) 
    {
        throw new Error("That cell has already been targeted, pick again. player_id: " + player_id + ", (" + x + ", " + y + ")");
    }        
}

//#endregion Asserts

//#region sha256
// sha256 from http://geraintluff.github.io/sha256/
var sha256 = function sha256(ascii) {
	function rightRotate(value, amount) {
		return (value>>>amount) | (value<<(32 - amount));
	};
	
	var mathPow = Math.pow;
	var maxWord = mathPow(2, 32);
	var lengthProperty = 'length'
	var i, j; // Used as a counter across the whole file
	var result = ''

	var words = [];
	var asciiBitLength = ascii[lengthProperty]*8;
	
	//* caching results is optional - remove/add slash from front of this line to toggle
	// Initial hash value: first 32 bits of the fractional parts of the square roots of the first 8 primes
	// (we actually calculate the first 64, but extra values are just ignored)
	var hash = sha256.h = sha256.h || [];
	// Round constants: first 32 bits of the fractional parts of the cube roots of the first 64 primes
	var k = sha256.k = sha256.k || [];
	var primeCounter = k[lengthProperty];
	/*/
	var hash = [], k = [];
	var primeCounter = 0;
	//*/

	var isComposite = {};
	for (var candidate = 2; primeCounter < 64; candidate++) {
		if (!isComposite[candidate]) {
			for (i = 0; i < 313; i += candidate) {
				isComposite[i] = candidate;
			}
			hash[primeCounter] = (mathPow(candidate, .5)*maxWord)|0;
			k[primeCounter++] = (mathPow(candidate, 1/3)*maxWord)|0;
		}
	}
	
	ascii += '\x80' // Append Ƈ' bit (plus zero padding)
	while (ascii[lengthProperty]%64 - 56) ascii += '\x00' // More zero padding
	for (i = 0; i < ascii[lengthProperty]; i++) {
		j = ascii.charCodeAt(i);
		if (j>>8) return; // ASCII check: only accept characters in range 0-255
		words[i>>2] |= j << ((3 - i)%4)*8;
	}
	words[words[lengthProperty]] = ((asciiBitLength/maxWord)|0);
	words[words[lengthProperty]] = (asciiBitLength)
	
	// process each chunk
	for (j = 0; j < words[lengthProperty];) {
		var w = words.slice(j, j += 16); // The message is expanded into 64 words as part of the iteration
		var oldHash = hash;
		// This is now the undefinedworking hash", often labelled as variables a...g
		// (we have to truncate as well, otherwise extra entries at the end accumulate
		hash = hash.slice(0, 8);
		
		for (i = 0; i < 64; i++) {
			var i2 = i + j;
			// Expand the message into 64 words
			// Used below if 
			var w15 = w[i - 15], w2 = w[i - 2];

			// Iterate
			var a = hash[0], e = hash[4];
			var temp1 = hash[7]
				+ (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) // S1
				+ ((e&hash[5])^((~e)&hash[6])) // ch
				+ k[i]
				// Expand the message schedule if needed
				+ (w[i] = (i < 16) ? w[i] : (
						w[i - 16]
						+ (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15>>>3)) // s0
						+ w[i - 7]
						+ (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2>>>10)) // s1
					)|0
				);
			// This is only used once, so *could* be moved below, but it only saves 4 bytes and makes things unreadble
			var temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) // S0
				+ ((a&hash[1])^(a&hash[2])^(hash[1]&hash[2])); // maj
			
			hash = [(temp1 + temp2)|0].concat(hash); // We don't bother trimming off the extra ones, they're harmless as long as we're truncating when we do the slice()
			hash[4] = (hash[4] + temp1)|0;
		}
		
		for (i = 0; i < 8; i++) {
			hash[i] = (hash[i] + oldHash[i])|0;
		}
	}
	
	for (i = 0; i < 8; i++) {
		for (j = 3; j + 1; j--) {
			var b = (hash[i]>>(j*8))&255;
			result += ((b < 16) ? 0 : '') + b.toString(16);
		}
	}
	return result;
};
//#endregion sha256

