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


//.....................................INITIAL CONFIG................................//

//Grab token and default port.
require('./env.js');

//
var http = require('http');
var port = process.env.PORT || 3000;
//Create a server to avoid port timeout errors.
http.createServer(function(request, response) {}).listen(port);

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

//var triviaQuestion = '';
//var answers = [];
//var scores = {};
//var storeAnswers = [];

//var gameOn = false;
//var gameMaster = '';


//.....................................MAIN METHODS................................//

//For grabbing current scores.
var getScores = function(scoreData) {
    var scoresString = '';
    for (var key in scoreData) {
        if (scoreData.hasOwnProperty(key)) {
            var playerName = '<@' + key + '>';
            scoresString += playerName + " : " + scoreData[key] + '\n';
        }
    }
    return scoresString;
};

//Main game method.
var startGame = function(question, answers, channel, gameMaster) {
    controller.hears(answers, 'ambient', function(bot, message) {
        //Make sure answer is from the corret question and not from person who made the game.
        var player = message.user;
        var answerChannel = message.channel
        var channelData;

        //Grab channel info
        controller.storage.channels.get(answerChannel, function(err, data) {
            channelData = data;

            if (player !== channelData.gameMaster && answerChannel === channel) { //!== gameMaster

                //Immediately pop off answer first to make sure no one else gets a point
                answers.splice(answers.indexOf(message.text), 1);
                controller.storage.channels.save({ id: answerChannel, scores: answers }, function(err, id) {});

                //Add reaction for correct answer.
                bot.api.reactions.add({
                    timestamp: message.ts,
                    channel: answerChannel,
                    name: '100'
                }, function(err, res) {
                    if (err) {
                        bot.botkit.log('Failed to add emoji reaction:', err);
                    }
                });

                //Grab player scores
                    var scores = channelData.scores || {};
                    //Increase players score
                    if (!scores[player]) {
                        scores[player] = 1;
                    } else {
                        scores[player] += 1;
                    }
                    //Update new scores
                    controller.storage.channels.save({ id: answerChannel, scores: scores }, function(err, id) {});
            

                //See if its game over
                if (!answers.length) {
                    //Game over, return scores
                    gameOver(channel, message);
                }
            }
        });

    });
};

var gameOver = function(channel, message) {
    //Print out game winning info.
    var scores;
    controller.storage.channels.get(channel, function(err, data) {
        scores = data.scores;
        //correctAnswers = data.storedAnswers;
        //Update new scores
        var reply = 'Game Over! \n';
        var scoresString = getScores(scores);
        bot.reply(message, reply + 'Scores: \n' + scoresString);
    });
    //Remove all the channel data so a new game could start.
    var removeData = {};
    removeData['id'] = channel;
    removeData['question'] = undefined;
    removeData['answers'] = undefined;
    removeData['gameOn'] = false;
    removeData['gameMaster'] = undefined;
    controller.storage.channels.save({ id: channel, scores: scores }, function(err, id) {});
};

//..................................CONTROLLERS......................................//

//Start a game with a mention.
controller.hears(['start'], 'direct_mention,mention', function(bot, message) {
    //See if channel has a game playing
    controller.storage.channels.get(message.channel, function(err, channel_data) {
        if (channel_data && channel_data.gameOn) {
            bot.reply(message, 'You are already playing a game here! Tell me to give up if you quit');
            return;
        }
    });
    //See if user has a game stored
    controller.storage.users.get(message.user, function(err, user_data) {
        if (err || !user_data || !user_data.question || !user_data.answers) {
            bot.reply(message, 'There isn\'t a question set up. Direct message me saying \'start\' to set up a game!');
        } else {
            //Everything is good so set it up.
            var question = user_data.question;
            var correctAnswers = user_data.answers;
            bot.reply(message, 'Trivia Begins! ' + question +
                '. There are ' + correctAnswers.length + ' answers.');

            //Save game to channel
            controller.storage.channels.save({
                id: message.channel,
                question: question,
                answers: correctAnswers,
                storedAnswers: correctAnswers,
                gameOn: true,
                gameMaster: message.user
            }, function(err) {});

            //Remove from user store
            var user_data = {};
            user_data['id'] = message.user
            user_data['question'] = undefined;
            user_data['answers'] = undefined;
            controller.storage.users.save(user_data, function(err) {});

            startGame(question, correctAnswers, message.channel, message.user);
        }

    });
});

//Repeats the question asked
controller.hears(['question'], 'direct_mention,mention', function(bot, message) {
    controller.storage.channels.get(message.channel, function(err, channel_data) {
        if (err || !channel_data.gameOn) {
            bot.reply(message, 'There isn\'t a game happening!');
        } else {
            bot.reply(message, 'The question is: ' + channel_data.question);
        }
    });
});

//Prints the scores
controller.hears(['score'], 'direct_mention,mention', function(bot, message) {
    controller.storage.channels.get(message.channel, function(err, channel_data) {
        if (err || !channel_data.gameOn) {
            bot.reply(message, 'There isn\'t a game happening!');
        } else {
            var scoreData = channel_data.scores;
            var scoresString = getScores(scoreData);
            bot.reply(message, 'Scores: ' + scoresString);
        }
    });

});


//Prints the scores and answers. Stops the game.
controller.hears(['stop', 'reset', 'give up'], 'direct_mention,mention', function(bot, message) {
    controller.storage.channels.get(message.channel, function(err, channel_data) {
        if (err || !channel_data.gameOn) {
            bot.reply(message, 'There isn\'t a game happening!');
        } else {
            gameOver(message.channel, message);
        }
    });

});

//Displays remaining answers
controller.hears(['answer'], 'direct_mention,mention', function(bot, message) {
    controller.storage.channels.get(message.channel, function(err, channel_data) {
        if (err || !channel_data.gameOn) {
            bot.reply(message, 'There isn\'t a game happening!');
        } else {
            bot.reply(message, 'There are ' + channel_data.answers.length + ' answer(s) left.');
        }
    });

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
    //See if user has a game stored
    controller.storage.users.get(message.user, function(err, user_data) {
        if (!err && user_data && user_data.question) {
            var question = user_data.question;
            bot.reply(message, 'You have already set up this question:' + question);
            return;
        }
        //insert remove question here if want a new one.
    });
    bot.startConversation(message, function(err, convo) {
        var triviaQuestion;
        var answers;
        if (!err) {
            convo.say('Lets get a game started.');
            convo.ask('What\'s your trivia question?', function(response, convo) {
                triviaQuestion = response.text;
                convo.ask('So what are the top answers? Separate em by some commas (ex: cool, things, coolio)', function(response, convo) {
                    var answerString = response.text.replace(/,\s+/g, ',');
                    //storeAnswers = answerString;
                    answers = answerString.split(',');
                    convo.next();
                });
                convo.next();
            });
            convo.on('end', function(convo) {
                if (convo.status == 'completed') {
                    bot.reply(message, 'OK! The game is ready to go with ' + triviaQuestion + ' and ' +
                        answers.toString().replace(/,/g, ', ') + '. If this is wrong, just say start again!');
                    //Store game in user
                    var user_data = {};
                    user_data['id'] = message.user
                    user_data['question'] = triviaQuestion;
                    user_data['answers'] = answers;
                    controller.storage.users.save(user_data, function(err) {
                        if (err)
                            console.log(err)
                    });
                } else {
                    // this happens if the conversation ended prematurely for some reason
                    bot.reply(message, 'OK, nevermind!');
                }
            });
        } else if (gameOn) {
            bot.reply(message, 'Sorry you are already leading a game.');
        }
    });
});