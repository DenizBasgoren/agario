
let http = require('http')
let ws = require('ws')
let repl = require('repl')
let fs = require('fs')
let process = require('process')
let staticServer = require('serve-static')(`${__dirname}/dist`, {
    index: ['index.html'],
    fallthrough: false
})

repl.start({ useGlobal: true})

///   db
let db = global.db = {
    players: randomBots(100),
    rankings: [], // {name: 'Deniz Basgoren', score: 1}
    websockets: new Set()
}


// util
function randomBots(n) {
    let bots = []

    while (bots.length < n) {

        let bot = {
            name: '',
            type: 'bot', // bot human
            status: 'playing', // playing resting
            score: 10,
            color: ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple'][Math.floor(Math.random() * 7)],
            uid: Math.floor(Math.random() * 10**15 )
        }

        if (bots.length === 0) {
            bot.x = 0,
            bot.y = 0
        }
        else if (bots.length === 1) {
            bot.x = 100,
            bot.y = 100
        }
        else {
            let mostDistantX = bots[0].x
            let mostDistantY = bots[0].y

            for (let i = 0; i<bots.length; i++) {
                if (Math.abs(bots[i].x) > mostDistantX ) {
                    mostDistantX = Math.abs(bots[i].x)
                }
                if (Math.abs(bots[i].y) > mostDistantY ) {
                    mostDistantY = Math.abs(bots[i].y)
                }
            }

            let collision
            do {
                collision = false
                bot.x = Math.random() * (2*mostDistantX+1600) - (mostDistantX+800)
                bot.y = Math.random() * (2*mostDistantY+1600) - (mostDistantY+800)

                // console.log(`len ${bots.length} x ${bot.x.toFixed(2)} y ${bot.y.toFixed(2)} `)
                for (let i = 0; i<bots.length; i++) {
                    if ( distance(bot, bots[i]) < bot.score + bots[i].score + 20) {
                        collision = true
                        break
                    }
                }

            } while ( collision )
            
        }

        let firstLetter = ['B', 'Ch', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'Q', 'S', 'Sh', 'T', 'W', 'X', 'Y', 'Zh']
        let secondLetter = ['a', 'e', 'i', 'o', 'u']
        let thirdLetter = ['', '', '', '', '', 'a', 'e', 'i', 'o', 'u']
        let fourthLetter = ['', 'ng']

        for (let i = 0; i<2; i++) {
            bot.name += firstLetter[ Math.floor(Math.random() * firstLetter.length) ]
            bot.name += secondLetter[ Math.floor(Math.random() * secondLetter.length) ]
            bot.name += thirdLetter[ Math.floor(Math.random() * thirdLetter.length) ]
            bot.name += fourthLetter[ Math.floor(Math.random() * fourthLetter.length) ]
        }

        bots.push(bot)
    }

    return bots
}

function distance(p1, p2) {
    return Math.sqrt((p1.x - p2.x)**2 + (p1.y - p2.y)**2)
}

function randomMove() {
    let seed = new Date().getSeconds() + Math.floor(Math.random() * 30)
    return {
        x: Math.floor(seed / 30) - 1,
        y: seed % 3 - 1
    }
}






let httpServer = http.createServer((req,res) => {
    // console.log(`new req ${req.url} resolving as ${__dirname}/dist${req.url}`)
    /// serve the files
    staticServer(req,res, (er) => {
        if (er) {
            res.statusCode = 404
            res.end('Not found :(')
        }
    })
})
httpServer.listen(process.env.PORT || 3000, () => console.log('Listening ...'))



let wsServer = new ws.Server( {
    server: httpServer,
    clientTracking: false
} )

wsServer.on('connection', socket => {
    
    db.websockets.add(socket)

    socket.on('message', encryptedMsg => {

        let msg = JSON.parse(encryptedMsg)

        if ( msg[0] === 'start' ) {
            // console.log('start')

            let filterName = str => str.substr(0, 10).split('').map(l => l.charCodeAt() >= 32 && l.charCodeAt() <= 126 ? l : '?').join('')

            let player = {
                name: filterName( msg[1] ),
                color: msg[2],
                score: 200,
                type: 'human',
                status: 'playing', // playing resting
                uid: Math.floor(Math.random() * 10**15 )
            }

            let mostDistantX = db.players[0].x
            let mostDistantY = db.players[0].y

            for (let i = 0; i<db.players.length; i++) {
                if (Math.abs(db.players[i].x) > mostDistantX ) {
                    mostDistantX = Math.abs(db.players[i].x)
                }
                if (Math.abs(db.players[i].y) > mostDistantY ) {
                    mostDistantY = Math.abs(db.players[i].y)
                }
            }

            let collision
            do {
                collision = false
                player.x = Math.random() * (2*mostDistantX+80) - (mostDistantX+40)
                player.y = Math.random() * (2*mostDistantY+80) - (mostDistantY+40)

                for (let i = 0; i<db.players.length; i++) {
                    if ( distance(player, db.players[i]) < player.score + db.players[i].score + 20) {
                        collision = true
                        break
                    }
                }

            } while ( collision )
            
            db.players.push(player)
            socket.uid = player.uid
            updateRanking(player)

            socket.send(JSON.stringify([
                'setuid',
                player.uid
            ]))
            
        }

        else if (msg[0] === 'move') {
            // console.log('move!')
            for (let i = 0; i<db.players.length; i++) {
                if (db.players[i].uid === socket.uid) {
                    // console.log('found')
                    db.players[i].x += msg[1] *10
                    db.players[i].y += msg[2] *10
                    break
                }
            }
        }
        
    })

    socket.on('closing', () => handleSocketClose(socket))
    socket.on('close', () => handleSocketClose(socket))
    socket.on('error', () => handleSocketClose(socket))
})


function handleSocketClose(socket) {
    let player, playerIndex
    for (let i = 0; i<db.players.length; i++) {
        if (db.players[i].uid === socket.uid) {
            player = db.players[i]
            playerIndex = i
            break
        }
    }

    if (!player) {
        db.websockets.delete(socket)
        return
    }

    updateRanking(player)
    db.players.splice(playerIndex, 1)
    db.websockets.delete(socket)
}

function updateRanking(player) {
    for (let j = 0; j<10; j++) {
        if ( !db.rankings[j] ) {
            db.rankings[j] = {
                name: player.name,
                score: player.score
            }
            break
        }
        else {
            if (db.rankings[j].score < player.score) {
                db.rankings.splice(j, 0, {
                    name: player.name,
                    score: player.score
                })

                db.rankings.splice(10, 1)
                break
            }
        }
    }
}

// LOOP
setInterval( function serverLoop () {
    
    if (db.websockets.size === 0) return

    for (let i = 0; i< db.players.length; i++) {
        if (db.players[i].type === 'bot') {
            let move = randomMove()

            // register move
            db.players[i].x += move.x *2
            db.players[i].y += move.y *2
        }
    }

    db.websockets.forEach(socket => {
        socket.send(JSON.stringify([
            'update',
            db.players.filter(p => p.status === 'playing').map(p => {
                return { x: p.x, y: p.y, score: p.score, name: p.name, color: p.color, uid: p.uid}
            }),
            db.rankings
        ]))
    })

}, 1000/20)
