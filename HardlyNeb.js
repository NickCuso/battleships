let NebPay = require("nebpay");
let nebPay = new NebPay();

function nebWrite(method, args, listener) 
{
    nebPay.call(contract_address, 0, method, JSON.stringify(args), {
        listener: listener
    });
}

function nebRead(method, args, listener) 
{
    nebPay.simulateCall(contract_address, 0, method, JSON.stringify(args), {
        listener: function(resp) 
        {
            var error = resp.execute_err;
            var result;
            if(!error) 
            {
                if(resp.result) 
                {
                    result = JSON.parse(resp.result);
                }
            } else 
            {
                console.log("Error: " + error);
            }

            listener(result, error);
        }
    });
}
    