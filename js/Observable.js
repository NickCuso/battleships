function Observable() 
{
    this.handlers = [];  
}
 
Observable.prototype = 
{
    sub: function(fn) 
    {
        this.handlers.push(fn);
    },
 
    unsub: function(fn) 
    {
        this.handlers = this.handlers.filter(
            function(item) 
            {
                if (item !== fn) 
                {
                    return item;
                }
            }
        );
    },
 
    fire: function(a, b) 
    {
        this.handlers.forEach(function(item) 
        {
            item.call(this, a, b);
        });
    }
}
 