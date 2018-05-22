{ // Cancel a game before an opponent joins
    $("#cancel-game").hide();    
    
    on_start.sub(function()
    {
        $("#cancel-game").show();    
    });
    
    on_opponent_connected.sub(function()
    {
        $("#cancel-game").hide();    
    });
}

{ // Concede a game in progress
    $("#concede-game").hide();
    on_game_over.sub(function()
    {
        $("#concede-game").hide();    
    });
    
    on_opponent_connected.sub(function()
    {
        $("#concede-game").show();
    });
}
