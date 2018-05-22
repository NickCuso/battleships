$(document).ready(function() 
{
    //to check if the extension is installed
    //if the extension is installed, var "webExtensionWallet" will be injected in to web page
    if(typeof(webExtensionWallet) === "undefined"){
        alert ("Extension wallet is not installed, redirecting you to more information.");
        window.location =  location.protocol + '//' + location.host + location.pathname + 'about.html';  
    }
});