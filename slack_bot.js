/*~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
           ______     ______     ______   __  __     __     ______
          /\  == \   /\  __ \   /\__  _\ /\ \/ /    /\ \   /\__  _\
          \ \  __<   \ \ \/\ \  \/_/\ \/ \ \  _"-.  \ \ \  \/_/\ \/
           \ \_____\  \ \_____\    \ \_\  \ \_\ \_\  \ \_\    \ \_\
            \/_____/   \/_____/     \/_/   \/_/\/_/   \/_/     \/_/

//TO DO:
//Add running game winner totals
//More than one game at a time
//Weed out duplicate answers

//FOR TESTING --- DON'T FORGET TO ADD GAMEMASTER PLAYER CLAUSE FOR REAL GAMEPLAY.

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~*/

require('./env.js');
var port = process.env.PORT || 3000;

if (!process.env.token) {
    console.log('Error: Specify token in environment');
    process.exit(1);
}

var Botkit = require('./lib/Botkit.js');
var os = require('os');

var controller = Botkit.slackbot({
    debug: true
});

var bot = controller.spawn({
    token: process.env.token
}).startRTM();

var triviaQuestion = '';
var answers = [];
var scores = {};
var storeAnswers = [];

var gameOn = false;
var gameMaster = '';


//.....................................MAIN METHODS................................//

//For grabbing current scores.
var getScores = function() {
    var scoresString = '';
    for (var key in scores) {
        if (scores.hasOwnProperty(key)) {
            var playerName = '<@' + key + '>';
            scoresString += playerName + " : " + scores[key] + '\n';
        }
    }
    return scoresString;
};

//Main game method.
var startGame = function() {
    controller.hears(answers, 'ambient', function(bot, message) {
        //This is a token need to fix
        var player = message.user;
        if (player) { //!== gameMaster) {

            //Immediately pop off answer
            answers.splice(answers.indexOf(message.text), 1);

            //Add reaction for correct answer.
            bot.api.reactions.add({
                timestamp: message.ts,
                channel: message.channel,
                name: '100'
            }, function(err, res) {
                if (err) {
                    bot.botkit.log('Failed to add emoji reaction:', err);
                }
            });

            //Increase players score
            if (!scores[player]) {
                scores[player] = 1;
            } else {
                scores[player] += 1;
            }

            //See if its game over
            if (!answers.length) {
                //Game over, return scores
                gameOn = false;
                triviaQuestion.length = '';
                var scoresString = getScores();
                bot.reply(message, 'Thats game over! Scores: ' + scoresString);
            }
        }

    });
};

//..................................CONTROLLERS......................................//

//Start a game with a mention.
controller.hears(['start'], 'direct_mention,mention', function(bot, message) {

    //Grab the question
    if (triviaQuestion.length) {
        if (gameOn) {
            bot.reply(message, 'There is already a game happening!');
        } else {
            gameOn = true;
            bot.reply(message, 'Trivia Begins! The question is: ' + triviaQuestion +
                '. There are ' + answers.length + ' answers.');
            //add in number of answers here
            startGame();
        }
    } else {
        bot.reply(message, 'There isn\'t a question set up. Direct message me saying \'start\' to set up a game!');
    }

});

//Repeats the question asked
controller.hears(['question'], 'direct_mention,mention', function(bot, message) {

    //Grab the question
    if (gameOn) {
        bot.reply(message, 'The question is: ' + triviaQuestion);
    } else {
        bot.reply(message, 'There isn\'t a game happening!');
    }

});

//Prints the scores
controller.hears(['score'], 'direct_mention,mention', function(bot, message) {
    if (gameOn) {
        var scoresString = getScores();
        bot.reply(message, 'Scores: ' + scoresString);
    } else {
        bot.reply(message, 'There isn\'t a game happening!');
    }

});


//Prints the scores and answers. Stops the game.
controller.hears(['stop', 'reset', 'give up'], 'direct_mention,mention', function(bot, message) {
    if (gameOn) {
        gameOn = false;
        triviaQuestion = '';
        var reply = 'The answers were: ' + storeAnswers.replace(/,/g, ', ') + '.\n';
        var scoresString = getScores();
        bot.reply(message, reply + 'Scores: \n' + scoresString);
    } else {
        bot.reply(message, 'There isn\'t a game happening!');
    }

});

//Displays remaining answers
controller.hears(['answer'], 'direct_mention,mention', function(bot, message) {
    if (gameOn) {
        bot.reply(message, 'There are ' + answers.length + ' answer(s) left.');
    } else {
        bot.reply(message, 'There isn\'t a game happening!');
    }

});


//How to message.
controller.hears(['how to', 'identify yourself', 'who are you', 'what do you do', 'help'],
    'direct_message,direct_mention,mention',
    function(bot, message) {
        bot.reply(message, 'I make trivia games! Send me a direct message with \'start\' and I will set up a game. Then go to a channel, mention me and say \'start game\' to begin! ' +
            'You can ask for scores and how many answers left during the game by mentioning me.');
    });

//Hello message.
controller.hears(['hey', 'hello', 'yo'],
    'direct_message,direct_mention,mention',
    function(bot, message) {
        bot.reply(message, 'It was 99 cents.');
    });

//Game set up in DM.
controller.hears(['start'], 'direct_message', function(bot, message) {
    bot.startConversation(message, function(err, convo) {
        if (!err && !gameOn) {
            convo.say('Lets get a game started.');
            convo.ask('What\'s your trivia question?', function(response, convo) {
                triviaQuestion = response.text;
                convo.ask('So what are the top answers? Separate em by some commas (ex: cool, things, coolio)', function(response, convo) {
                    var answerString = response.text.replace(/,\s+/g, ',');
                    storeAnswers = answerString;
                    answers = answerString.split(',');
                    gameMaster = message.user;
                    convo.next();
                });
                convo.next();
            });
            convo.on('end', function(convo) {
                if (convo.status == 'completed') {
                    bot.reply(message, 'OK! The game is ready to go with ' + triviaQuestion + ' and ' +
                        answers.toString().replace(/,/g, ', ') + '. If this is wrong, just say start again!');
                } else {
                    // this happens if the conversation ended prematurely for some reason
                    bot.reply(message, 'OK, nevermind!');
                }
            });
        } else if (gameOn) {
            bot.reply(message, 'Sorry a game is being played!');
        }
    });
});