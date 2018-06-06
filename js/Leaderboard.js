var leaderboard = [];

nebReadAnon("getAllUsersWithStats", null, function(response) 
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
            leaderboard = [];

            nebReadAnon("getStatsForUser", [user], function(stats, ignore, args) 
            {
                if(stats)
                {
                    stats.addr = args[0];
                    leaderboard.push(stats);
                    leaderboard.sort(function (a, b) 
                    {
                        return parseInt(a.balance) < parseInt(b.balance);
                    });
                    $('#table').bootstrapTable('removeAll');

                    for(var i = 0; i < leaderboard.length; i++)
                    {
                        var s = leaderboard[i];
                        $('#table').bootstrapTable('append', {
                            shipcoins: formatCoins(s.balance),
                            address: s.addr,
                            started:s.start,
                            wins:s.win,
                            losses:s.lose + s.timeout,
                            timeouts:s.timeout,
                            moves:s.move,
                        });                
                    }
                }
            });
        }

       

      
    }
});
