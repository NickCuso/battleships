var balance = 1000000;
var payout = 42;
var count = 0;
while(balance > 0)
{
    console.log(payout);
    balance -= payout;
    payout *= 1.001;
    count ++;
}

console.log("Games: " + count);