on_opponent_available_change.sub(function() 
{
    if(opponent_available && !has_game_started)
    {
        $("#game-available").show();
    }
    else 
    {
        $("#game-available").hide();
    }
});

on_start.sub(function() 
{
    $("#game-available").hide();    
});

$("#next-payout").hide();
function pollForStatus() 
{
    nebReadAnon("getPendingGameId", null, function(result) 
    {
        if(result) 
        {
            var is_opponent_available = result != null;
            if(is_opponent_available != opponent_available)
            {
                opponent_available = is_opponent_available;
                on_opponent_available_change.fire();
            }
        } 
        nebReadAnon("getNextPayoutAmount", null, function(payout)
        {
            if(payout)
            {
                $("#next-payout").show();
                $("#next-payout-amount").text(formatCoins(payout));
            }
        });

        nebRead("myBalance", null, function(balance)
        {
            if(!balance)
            {
                balance = 0;
            }
        
            $("#my-balance").show();    
            $("#my-balance-amount").text(formatCoins(balance));
        });
        
        nebReadAnon("balanceOf", [contract_address], function(balance)
        {
            if(!balance)
            {
                balance = 0;
            }
        
            $("#shipcoins-remaining").text(formatCoins(balance));
            $("#shipcoins-distributed").text(formatCoins(1000000000000000000000000-balance));
        });

        setTimeout(pollForStatus, auto_refresh_interval * 5);
    });
}
pollForStatus();

