on_transaction.sub(function(method, args, resp)
{
    $("#transaction-log").append(resp.txhash + ": " + method + "(" + JSON.stringify(args) + ")\r\n\r\n");
});