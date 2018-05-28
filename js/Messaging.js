

$("#your-turn").hide();
$("#opponent-turn").hide();
$("#your-turn-over-pending").hide();
on_opponent_connected.sub(function()
{
    $("#your-turn-over-pending").hide();
    
    if(!is_my_turn)
    {
        $("#opponent-turn").show();
    }
});
on_my_turn_over.sub(function()
{
    $("#your-turn").hide();
    $("#your-turn-over-pending").show();
});
on_game_over.sub(function()
{
    $("#your-turn-over-pending").hide();
    $("#your-turn").hide();
    $("#opponent-turn").hide();
});

on_turn_change.sub(function()
{   
    $("#your-turn-over-pending").hide();
    if(is_my_turn)
    {
        $("#your-turn").show();        
        $("#opponent-turn").hide();        
    }
    else if(opponent_connected)
    {
        $("#opponent-turn").show();        
        $("#your-turn").hide();        
    }
});

if(!window.location.hash)
{
    $("#resuming-game").hide();
} 



$("#confirm-i-lost").hide();
on_i_appear_to_have_lost.sub(function()
{
    $("#opponent-turn").hide();
    $("#your-turn").hide();  
    
    $("#confirm-i-lost").show();    
});

on_concede.sub(function()
{
    $("#your-turn-over-pending").hide();
    $("#opponent-turn").hide();
    $("#your-turn").hide();   

    $("#on-concede").show();   
});

$("#confirm-win").hide();
on_i_appear_to_have_won.sub(function()
{
    $("#opponent-turn").hide();
    $("#your-turn").hide();           

    $("#confirm-win").show();    
});

$("#game-over-you-won").hide();
$("#game-over-you-lose").hide();
on_game_over.sub(function(i_won)
{
    $("#confirm-i-lost").hide();    
    $("#confirm-win").hide();
    
    if(i_won)
    {
        $("#game-over-you-won").show();
    }
    else
    {
        $("#game-over-you-lose").show();
    }
});


on_board_layout_complete.sub(function() 
{
    $("#state-message-start").hide();
    $("#state-message-layout-complete").show();
});
on_start_requested.sub(function() 
{
    $("#state-message-layout-complete").hide();
    $("#state-message-start-requested").show();
});

$("#waiting-for-opponent").hide();
on_start.sub(function()
{
    $("#resuming-game").hide();
    $("#state-message-layout-complete").hide();
    
    $("#state-message-start-requested").hide();
    $("#waiting-for-opponent").show();    
    $("#roster-sidebar-container").hide();
});
on_opponent_connected.sub(function() 
{
    $("#waiting-for-opponent").hide();   
    $("#enemy-board-col").show();
});