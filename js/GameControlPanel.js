
on_opponent_connected.sub(function() 
{
    $("#game-control-panel").show();
});

on_opponent_available_change.sub(function() 
{
    if(opponent_available)
    {
        $("#game-available").show();
    }
    else 
    {
        $("#game-available").hide();
    }
});

function pollForStatus() 
{
    nebRead("getStatus", null, function(result) 
    {
        if(result) 
        {
            console.log("Server status is " + result);
            var is_opponent_available = result.pending_game_id != null;
            if(is_opponent_available != opponent_available)
            {
                opponent_available = is_opponent_available;
                on_opponent_available_change.fire();
            }
        } 

        setTimeout(pollForStatus, auto_refresh_interval * 5);
    });
}
pollForStatus();
