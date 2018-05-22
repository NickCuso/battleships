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
                    var score = stats.win - stats.lose - stats.timeout;
                    $('#leaderboard').append("<li>" + score + " for " + args[0] + JSON.stringify(stats) + "</li>");
                }
            });
        }
    }
});
