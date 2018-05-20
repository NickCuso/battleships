// youtube.com/HardlyDifficult
// Built for Nebulas by HardlyDifficult.  



// TODO
// - address -> {win, lose, timeout}
// - Timeout (isTimeout call?)
// - Naming conventions, e.g. asserts
// - Comments

var CryptoShipsContract = function() 
{
    LocalContractStorage.defineProperty(this, "pending_gameid");

    LocalContractStorage.defineMapProperty(this, "addr_to_in_progress_txhash"); 
    LocalContractStorage.defineMapProperty(this, "txhash_to_gameid"); 
    // Data: {
    //  date_started, current_player_id, date_last_action,
    //  targeted_cells: [{player_id, x, y, is_hit}],
    //  winner_id, is_winner_confirmed, did_loser_quit
    //  player[0/1]: {addr, board_secrets, revealed_seeds, revealed_ships: [{name, start_x, start_y, is_horizontal}]},
    //}
    LocalContractStorage.defineMapProperty(this, "gameid_to_data"); 
}
  
CryptoShipsContract.prototype = 
{
    init: function() { },

    startOrJoinGame: function(board_secrets) 
    {
        this.assertIHaveNoGameInProgress();

        var player_id;
        var gameid;
        var data;

        if(!this.pending_gameid) 
        { // New game
            gameid = Blockchain.transaction.hash;
            this.pending_gameid = gameid;
            
            player_id = 0;
            
            data = {};
            data.date_started = Date.now();
            data.player = [];
            data.targeted_cells = [];
        } else 
        { // Join game
            gameid = this.pending_gameid;
            this.pending_gameid = null;

            player_id = 1;
            
            data = this.gameid_to_data.get(gameid);
            data.current_player_id = Math.floor(Math.random() * 2); // 0 or 1
        }
        
        data.player[player_id] = {};
        data.player[player_id].addr = Blockchain.transaction.from;
        data.player[player_id].board_secrets = board_secrets;
        data.player[player_id].revealed_seeds = emptyBoardSizedArray();
        data.player[player_id].revealed_ships = [];
        
        data.date_last_action = Date.now();

        this.addr_to_in_progress_txhash.put(Blockchain.transaction.from, Blockchain.transaction.hash);
        this.txhash_to_gameid.put(Blockchain.transaction.hash, gameid);
        this.gameid_to_data.put(gameid, data);
    },

    makeMove: function(gameid, x, y) 
    {
        assertValidCell(x, y);
        this.assertIsMyTurn(gameid);

        var data = this.getDataForGameid(gameid);
        if(data.targeted_cells.length > 0) 
        {
            throw new Error("Call revealAndMakeMove instead.");
        }

        var other_player_id = otherPlayer(data.current_player_id);
        var other_player = data.player[other_player_id];
        if(other_player.revealed_seeds[x][y]) 
        {
            throw new Error("That cell has already been targeted, pick again.");
        }        

        data.targeted_cells.push({player_id: data.current_player_id, x, y});
        data.current_player_id = other_player_id;

        data.date_last_action = Date.now();     
        this.gameid_to_data.put(gameid, data); // Save changes
    },

    revealAndMakeMove: function(gameid, x, y, is_hit, reveal_seed, sunk_ship) 
    { 
        assertValidCell(x, y);
        this.assertIsMyTurn(gameid);
        
        var data = this.gameid_to_data.get(gameid);
        if(data.targeted_cells.length == 0) 
        {
            throw new Error("Call makeMove instead.");
        }

        var current_player = data.player[data.current_player_id];
        var target = data.targeted_cells[data.targeted_cells.length - 1];
        validateCellReleave(current_player, target.x, target.y, is_hit, reveal_seed);
        validateSunkShip(current_player, sunk_ship, target.x, target.y);
        target.is_hit = is_hit;

        var other_player_id = otherPlayer(data.current_player_id);
        var other_player = data.player[other_player_id];
        if(other_player.revealed_seeds[x][y]) 
        {
            throw new Error("That cell has already been targeted, pick again.");
        }        

        data.targeted_cells.push({player_id: data.current_player_id, x, y});
        data.current_player_id = other_player_id;

        data.date_last_action = Date.now();     
        this.gameid_to_data.put(gameid, data); // Save changes
    },

    concedeGame: function(gameid, board_reveal_seeds, board_layout) 
    {
        this.assertIsMyTurn(gameid);

        var data = this.gameid_to_data.get(gameid);
        var player_id = data.current_player_id;
        var player = data.player[player_id];

        validateBoardReveal(player, board_reveal_seeds, board_layout);

        data.winner_id = otherPlayer(player_id);
        data.current_player_id = data.winner_id;

        this.gameid_to_data.put(gameid, data); // save changes
    },

    confirmWinner: function(gameid, board_reveal_seeds, board_layout) 
    {
        this.assertIsMyTurn(gameid);

        var data = this.gameid_to_data.get(gameid);
        if(!data.winner_id) 
        {
            throw new Error("Game is not over yet.");
        }
        if(data.is_winner_confirmed) 
        {
            throw new Error("Game is already over and confirmed, don't waste the gas.");
        }

        if(data.player[data.winner_id].addr != Blockchain.transaction.from) 
        {
            throw new Error("You didn't win, get outa here.");
        }
        
        var player_id = data.current_player_id;
        var player = data.player[player_id];

        validateBoardReveal(player, board_reveal_seeds, board_layout);

        data.is_winner_confirmed = 1;

        this.gameid_to_data.put(gameid, data); // save changes
        
        this.addr_to_in_progress_txhash.del(data.player[player_id].addr);
        this.addr_to_in_progress_txhash.del(data.player[otherPlayer(player_id)].addr);
    },

    quitAndAcceptTheLoss: function() 
    {
        var txhash = this.getTxHashForMyGameInProgress();
        var gameid = this.getGameIdForTxhash(txhash);
        var data = this.getDataForGameid(gameid);
        var player_id = 0;
        if(data.player[player_id].addr != Blockchain.transaction.from) 
        {
            player_id = 1;
            if(data.player[player_id].addr != Blockchain.transaction.from) 
            {
                throw new Error("Not your game!");
            }
        }
 
        data.winner_id = otherPlayer(player_id);
        data.is_winner_confirmed = 1;
        data.did_loser_quit = 1;
        
        this.addr_to_in_progress_txhash.del(data.player[player_id].addr);
        if(this.pending_gameid == gameid) 
        { // Game has not begun yet
            this.pending_gameid = null;
        } else 
        {
            this.addr_to_in_progress_txhash.del(data.player[otherPlayer(player_id)].addr);
        }

        this.gameid_to_data.put(gameid, data); // save changes        
    },

    // Read only
    getTxHashForMyGameInProgress: function() {
        var txhash = this.addr_to_in_progress_txhash.get(Blockchain.transaction.from);
        if(!txhash) {
            throw new Error("You do not have a game in progress, start a new one.");
        }
        return txhash;
    },

    getGameIdForTxhash: function(txhash) {
        var gameid = this.txhash_to_gameid.get(txhash);
        if(!gameid) {
            throw new Error("Invalid game, txhash not found.");
        }
        return gameid;
    },

    getDataForGameid: function(gameid) {
        var data = this.gameid_to_data.get(gameid);
        if(!data) {
            throw new Error("Data not found.. for gameid: " + gameid);
        }
        return data;
    },

    hasOpponentConnectedForGameid: function(gameid) 
    {
        return gameid != this.pending_gameid;
    },

    isMyTurnForGameid: function(gameid) 
    {
        var data = this.getDataForGameid(gameid);
        return data.player[data.current_player_id].addr == Blockchain.transaction.from;
    },

    getTurnInfo: function(gameid) 
    {
        var data = this.getDataForGameid(gameid);
        if(data.winner_id != null)
        {
            return {
                you_won: data.player[data.winner_id].addr == Blockchain.transaction.from,
                is_winner_confirmed: data.is_winner_confirmed
            };
        }
        else 
        {
            var is_my_turn = data.player[data.current_player_id].addr == Blockchain.transaction.from;
            var target = data.targeted_cells[data.targeted_cells.length - 1];
            var last_shot_is_hit;
            if(data.targeted_cells.length > 1)
            {
                last_shot_is_hit = data.targeted_cells[data.targeted_cells.length - 2].is_hit;
            }
            return { 
                is_my_turn,
                target_x: target == undefined ? undefined : target.x, 
                target_y: target == undefined ? undefined : target.y, 
                turn_counter: data.targeted_cells.length, last_shot_is_hit,
                revealed_ships: data.player[is_my_turn ? otherPlayer(data.current_player_id) : data.current_player_id].revealed_ships
            };
        }
    },
        
    assertIHaveNoGameInProgress: function() 
    {
        if(this.addr_to_in_progress_txhash.get(Blockchain.transaction.from)) 
        {
            throw new Error("You already have a game in progress.");
        }
    },
    
    assertIsMyTurn: function(gameid) 
    {
        if(!this.hasOpponentConnectedForGameid(gameid)) 
        {
            throw new Error("Game has not started yet");
        }        
    
        if(!this.isMyTurnForGameid(gameid)) 
        {
            throw new Error("Not your turn, sit tight.");
        }
    }
}

module.exports = CryptoShipsContract
    
///////////////////
// Helper methods
///////////////////

function assertValidCell(x, y) 
{
    if(x < 0 || x >= 10 || y < 0 || y >= 10) 
    {
        throw new Error("Cell is not valid, you selected (" + x + ", " + y + ").");
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

var otherPlayer = function(playerid) 
{
    return playerid == 0 ? 1 : 0;
}

function addShip(player_board_tiles, ship) 
{
    var x = ship.start_x;
    var y = ship.start_y;

    if(x < 0 || y < 0) 
    {
        throw new Error("Out of bounds");
    }

    for(var i = 0; i < ship.length; i++) {
        if(x >= 10 || y >= 10) 
        {
            throw new Error("Ship out of bounds, CHEATER!");
        }
        if(player_board_tiles[x][y]) 
        {
            throw new Error("Overlapping ships, CHEATER!");
        }

        player_board_tiles[x][y] = 1;

        if(ship.is_horizontal) 
        {
            x++;
        } else 
        {
            y++;
        }
    }
}

function validateCellReleave(player, x, y, is_hit, reveal_seed) 
{ 
    if(!is_hit) 
    {
        is_hit = 0;
    }

    var hash = sha256(is_hit + reveal_seed);
    var expected_cell_hash = player.board_secrets[x][y];
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
        var ship_includes_tile = false;
        var any_tile_not_revealed = false;
        var ship_x = sunk_ship.start_x;
        var ship_y = sunk_ship.start_y;
        for(var i = 0; i < sunk_ship.length; i++)
        {
            if(ship_x == x && ship_y == y)
            {
                ship_includes_tile = true;
            }
            else 
            {
                if(player.revealed_seeds[ship_x][ship_y] == null)
                {
                    any_tile_not_revealed = true;
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
        if(any_tile_not_revealed)
        { 
            throw new Error("You shared a ship but it appears that ship is not sunk yet. Player: " + JSON.stringify(player) + "; sunk_ship: " + JSON.stringify(sunk_ship) + "; tile: (" + x + ", " + y + ")");
        }
        if(ship_includes_tile == false)
        {
            throw new Error("The ship you reported as just sunk was hit last... what you doing?  Cheater!");
        }

        player.revealed_ships.push(sunk_ship);
    }
}

function validateBoardReveal(player, board_reveal_seeds, board_layout) 
{
    // confirm board is a valid layout
    // send in start and rotation.  place each into a 2d array, if overlap or out of bounds you cheated.
    var player_board_tiles = emptyBoardSizedArray();

    addShip(player_board_tiles, board_layout.carrier);
    addShip(player_board_tiles, board_layout.battleship);
    addShip(player_board_tiles, board_layout.cruiser);
    addShip(player_board_tiles, board_layout.submarine);
    addShip(player_board_tiles, board_layout.destroyer);

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
    
    // On confirm: any not declared have an uncovered tile remaining.
    Object.keys(board_layout).forEach(function(key) 
    {
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
            var any_tile_not_revealed = false;
            var ship = board_layout[key];
            var x = ship.start_x;
            var y = ship.start_y;
            for(var i = 0; i < ship.length; i++)
            {
                if(player.revealed_seeds[x][y] !== undefined)
                {
                    any_tile_not_revealed = true;
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
            if(!any_tile_not_revealed)
            {
                throw new Error("You did not reveal when a ship was sunk.  Cheater!");
            }
        }
    });

    for(var x = 0; x < 10; x++) 
    {
        for(var y = 0; y < 10; y++) 
        {
            var seed = board_reveal_seeds[x][y];

            // Confirm all previous reveals are included
            var previous_seed = player.revealed_seeds[x][y];
            if(previous_seed && seed != previous_seed) 
            {
                throw new Error("Seed for cell (" + x + ", " + y + ") does not match the seed you shared previously. Was " 
                    + previous_seed + ", now " + seed);
            }
            
            // Confirm seeds for all hits
            var is_hit = player_board_tiles[x][y];
            if(is_hit) 
            {
                validateCellReleave(player, x, y, is_hit, seed);
            }
        }
    }
}

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