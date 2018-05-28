
var rawFile = new XMLHttpRequest();
rawFile.open("GET", 'english_words.txt');
rawFile.onreadystatechange = function ()
{
    if(rawFile.readyState === 4)
    {
        if(rawFile.status === 200 || rawFile.status == 0)
        {
            var allText = rawFile.responseText;
            var phrase = "";
            for(var i = 0; i < 12; i++)
            {
                var lines = allText.split('\n');
                var random_id = Math.floor(Math.random() * lines.length);
                var line = lines[random_id];
                if(i > 0)
                {
                    phrase += " ";
                }
                phrase += line;
            }
            $("#secret").val(phrase);
        }
    }
}
rawFile.send(null);
