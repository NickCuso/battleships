 nebRead("getAllUsersWithStats", null, function(response) 
{
    if(response)
    {
        var users = response.split(',');
        for(var i = 0; i < users.length; i++)
        {
            var user = users[i];
            if(!user) 
            {
                continue;
            }

            nebRead("getStatsForUser", [user], function(stats, ignore, args) 
            {
                if(stats)
                {
                    // <th data-sortable="true" data-field="shipcoins">Shipcoins</th>
                    // <th data-field="address">Address</th>
                    // <th data-field="games">Games Started</th>
                    // <th data-field="win">Wins</th>
                    // <th data-field="lose">Losses</th>
                    // <th data-field="timeout">Timeouts</th>
                    // <th data-field="move">Moves</th>
                    //var score = stats.win - stats.lose - stats.timeout;
                     //$('#leaderboard').append("<li>" + score + " for " + args[0] + JSON.stringify(stats) + "</li>");
                    $('#table').bootstrapTable('append', {
                        shipcoins: formatCoins(stats.balance),
                        address: args[0],
                        started:stats.start,
                        wins:stats.win,
                        losses:stats.lose + stats.timeout,
                        timeouts:stats.timeout,
                        moves:stats.move,
                    });                
                }
            });
        }

       

      
    }
});
