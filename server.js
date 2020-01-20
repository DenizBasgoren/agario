
let http = require('http')
let ws = require('ws')
let repl = require('repl')
let fs = require('fs')
let process = require('process')
let staticServer = require('serve-static')(`${__dirname}/dist`, {
    index: ['index.html'],
    fallthrough: false
})

const INITIALSCORE = 1000
const BOTSPEED = 3
const HUMANSPEED = 6 // hooman better than bots xd
const SPAWNAREA = 700
const TOTALBOTS = 100

repl.start({ useGlobal: true})

// IN-MEMORY DB
let db = global.db = {
    players: [], // [{x, y, type, status, name, color, score, uid}]
    websockets: new Set() // {uid, ...}
}

// FIRST, WHEN NO HUMANS ARE AROUND, CREATE BOTS
// WE ALWAYS ASSUME THAT DB.PLAYERS IS SORTED IN DECREASING ORDER OF SCORE
db.players = randomBots(TOTALBOTS).sort((a,b) => b.score - a.score )


// UTILS
// INSERTING AN ELEMENT INTO AN ARRAY, MAINTAINING IT SORTED
function insertIntoSortedArray(el, arr) {

    if (el.score <= arr[ arr.length-1 ].score ) {
        arr.push(el)
    }
    else {
        for (let i = 0; i<arr.length; i++) {
            if ( el.score > arr[i].score) {
                arr.splice(i, 0, el)
                break
            }
        }
    }

}


function randomScore() {
    return Math.floor( ((Math.random() + 1) ** 7) * 100)
}


function randomBots(n) {
    let bots = []

    while (bots.length < n) {

        let bot = {
            type: 'bot', // bot human
            status: 'playing', // playing resting
            name: randomName(),
            score: randomScore(),
            color: ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple'][Math.floor(Math.random() * 7)],
            uid: Math.floor(Math.random() * 10**15 )
        }

        placeOnTheMap(bot, [bots, db.players])

        
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


// ALGORITHM, IF BIGGER ONES ARE CLOSER THAN SMALLER ONES, RUN AWAY, OTHERWISE, GET THE BIGGEST OF THE SMALLER ONES
function botMove( ind ) {
    if (db.players.length === 1) return randomMove()

    // min distance between i and bigger ones
    let distB = Infinity
    let minDistantBInd

    for (let i = ind-1; i> -1; i--) {
        if (db.players[i].status === 'resting') continue

        let dist = distance(db.players[i], db.players[ind])
        if ( dist < distB) {
            distB = dist
            minDistantBInd = i
        }
    }

    // min distance between i and smaller but comparable ones
    let distS = Infinity
    let minDistantSInd

    for (let i = ind+1; i<db.players.length; i++) {
        if (db.players[i].status === 'resting') continue
        if (db.players[i].score * 10 < db.players[ind].score) break
        
        let dist = distance(db.players[i], db.players[ind])
        if ( dist < distS) {
            distS = dist
            minDistantSInd = i
        }
    }

    let {x, y} = db.players[ind]

    if (distB > distS) {
        if (distS === Infinity) return randomMove()

        // MATHY
        let tx = db.players[minDistantSInd].x
        let ty = db.players[minDistantSInd].y
        let a = (Math.atan2(ty-y, tx-x) + 3.14159265) * 8 / 3.14159265

        if (a < 1) return {x: -1, y: 0}
        else if (a < 3) return {x: -1, y: -1}
        else if (a < 5) return {x: 0, y: -1}
        else if (a < 7) return {x: 1, y: -1}
        else if (a < 9) return {x: 1, y: 0}
        else if (a < 11) return {x: 1, y: 1}
        else if (a < 13) return {x: 0, y: 1}
        else if (a < 15) return {x: -1, y: 1}
        else return {x: -1, y: 0}
    }
    else {
        if (distB === Infinity) return randomMove()

        let ex = db.players[minDistantBInd].x
        let ey = db.players[minDistantBInd].y
        let a = (Math.atan2(ey-y, ex-x) + 3.14159265) * 8 / 3.14159265

        if (a < 1) return {x: 1, y: 0}
        else if (a < 3) return {x: 1, y: 1}
        else if (a < 5) return {x: 0, y: 1}
        else if (a < 7) return {x: -1, y: 1}
        else if (a < 9) return {x: -1, y: 0}
        else if (a < 11) return {x: -1, y: -1}
        else if (a < 13) return {x: 0, y: -1}
        else if (a < 15) return {x: 1, y: -1}
        else return {x: 1, y: 0}
    }
}

function randomName() {
    let name = ''

    let firstLetter = ['B', 'Ch', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'Q', 'S', 'Sh', 'T', 'W', 'X', 'Y', 'Zh']
    let secondLetter = ['a', 'e', 'i', 'o', 'u']
    let thirdLetter = ['', '', '', '', '', 'a', 'e', 'i', 'o', 'u']
    let fourthLetter = ['', '', 'ng'] // SOME SPOTS ARE EMPTY TO SET THE PROBABILITY OF GETTING A 'NG' SMALLER

    for (let i = 0; i<2; i++) {
        name += firstLetter[ Math.floor(Math.random() * firstLetter.length) ]
        name += secondLetter[ Math.floor(Math.random() * secondLetter.length) ]
        name += thirdLetter[ Math.floor(Math.random() * thirdLetter.length) ]
        name += fourthLetter[ Math.floor(Math.random() * fourthLetter.length) ]
    }
    return name
}

// TRY PLACING ON A SPOT WHERE COLLISION WOULD NOT OCCUR
function placeOnTheMap( el, checkAgainstArr) {
    let k = 1
    let ca = checkAgainstArr

    while ( !el.x || !el.y ) {
        let x = Math.random() * k * 2 * SPAWNAREA - k * SPAWNAREA
        let y = Math.random() * k * 2 * SPAWNAREA - k * SPAWNAREA

        let collision = false

        collisionLabel:
        for (let i = 0; i<ca.length; i++) {
            for (let j = 0; j<ca[i].length; j++) {
                if (distance({x,y}, ca[i][j]) < Math.sqrt( .3183 * el.score) + Math.sqrt( .3183 * ca[i][j].score) + 10) {
                    collision = true
                    break collisionLabel
                }
            }
        }

        if (!collision) {
            el.x = x
            el.y = y
        }

        if (Math.random() < .05) k++
    }
    
}



// HTTP SERVER
let httpServer = http.createServer((req,res) => {
    /// serve the files
    staticServer(req,res, (er) => {
        if (er) {
            res.statusCode = 404
            res.end('Not found :(')
        }
    })
})
httpServer.listen(process.env.PORT || 3000, () => console.log('Listening ...'))


// WS SERVER
let wsServer = new ws.Server( {
    server: httpServer,
    clientTracking: false // WE TRACK MANUALLY, SO..
} )

wsServer.on('connection', socket => {
    
    db.websockets.add(socket)

    socket.on('message', encryptedMsg => {

        let msg = JSON.parse(encryptedMsg)

        if ( msg[0] === 'start' ) {

            let filterName = str => str.substr(0, 10).split('').map(l => l.charCodeAt() >= 32 && l.charCodeAt() <= 126 ? l : '?').join('')

            let player = {
                name: filterName( msg[1] ) || randomName(),
                color: msg[2],
                score: INITIALSCORE,
                type: 'human',
                status: 'playing', // playing resting
                uid: Math.floor(Math.random() * 10**15 )
            }

            placeOnTheMap( player, [db.players])
            insertIntoSortedArray(player, db.players)

            socket.uid = player.uid

            socket.send(JSON.stringify([
                'setuid',
                player.uid
            ]))
            
        }

        else if (msg[0] === 'move') {
            for (let i = 0; i<db.players.length; i++) {
                if (db.players[i].uid === socket.uid) {

                    // IT IS IMPORTANT NOT TO APPLY MOVE RIGHT AS IT COMES FROM THE CLIENT
                    // WE SAVE MOVE UNDER NEXTMOVE, AND APPLY IT ON THE MAIN SERVER LOOP
                    // THIS IS A MEASURE AGAINST SPEED / TRANSPORTATION HACKS
                    db.players[i].nextMove = {x: msg[1], y: msg[2]}

                    break
                }
            }
        }

        else if (msg[0] === 'restart') {

            let player
            for (let i = 0; i<db.players.length; i++) {
                if (db.players[i].uid === socket.uid) {
                    player = db.players[i]
                    break
                }
            }

            if (!player) return
            player.x = undefined
            player.y = undefined

            // new coords
            placeOnTheMap(player, [db.players])
            
            // status playing
            player.status = 'playing'
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

    // updateRanking(player)
    db.players.splice(playerIndex, 1)
    db.websockets.delete(socket)
}

// MAIN SERVER LOOP
setInterval( function serverLoop () {
    
    if (db.websockets.size === 0) return

    // movements
    for (let i = 0; i< db.players.length; i++) {
        if (db.players[i].type === 'bot') {
            let move = botMove( i )

            // APPLY BOT MOVE
            db.players[i].x += move.x * BOTSPEED * ( move.x && move.y ? .7 : 1)
            db.players[i].y += move.y * BOTSPEED * ( move.x && move.y ? .7 : 1)
        }
        else {

            let x, y
            if (db.players[i].nextMove) {
                x = db.players[i].nextMove.x || 0
                y = db.players[i].nextMove.y || 0
            }
            else {
                x = 0
                y = 0
            }

            // APPLY HUMAN MOVE
            db.players[i].x += x * HUMANSPEED * (x && y ? .7 : 1)
            db.players[i].y += y * HUMANSPEED * (x && y ? .7 : 1)
            
            // REMOVE PREV MOVES
            delete db.players[i].nextMove

        }


        // TP BACK, IF TOO FAR AWAY FROM SPAWN
        if (Math.abs(db.players[i].x) > SPAWNAREA * 2 || Math.abs(db.players[i].y) > SPAWNAREA * 2 ) {
            delete db.players[i].x
            delete db.players[i].y
            placeOnTheMap(db.players[i], [db.players])
        }
    }

    // SEND UPDATED POSITIONS
    db.websockets.forEach(socket => {
        socket.send(JSON.stringify([
            'update',
            db.players.filter(p => p.status === 'playing').map(p => {
                return { x: p.x, y: p.y, score: p.score, name: p.name, color: p.color, uid: p.uid}
            })
        ]))
    })


    // COLLISION DETECTION
    let toBeReInserted = []

    // NOTE: SINCE DB.PLAYERS IS ASSUMED TO BE SORTED,
    // DB.PLAYERS[I] IS ALWAYS THE SMALLER ONE AND
    // DB.PLAYERS[J] IS ALWAYS THE BIGGER ONE
    for (let i = 1; i<db.players.length; i++) {

        // DONT CONSIDER RESTING ONES, THAT IS, EATEN ONES, OR TEMPORARILY DISCONNECTED ONES
        if (db.players[i].status === 'resting') continue

        for (let j = 0; j<i; j++) {

            // SAME
            if (db.players[j].status === 'resting') continue

            // CIRCLE-CIRCLE COLLISION
            if ( distance( db.players[i], db.players[j]) < Math.sqrt( .3183 * db.players[i].score) + Math.sqrt( .3183 * db.players[j].score)) {

                // collision detected
                db.players[j].score += db.players[i].score

                let bigger = db.players.splice(j, 1)[0]
                insertIntoSortedArray( bigger, db.players)

                if (db.players[i].type === 'bot') {
                    
                    db.players.splice(i, 1)
                    toBeReInserted.push(randomBots(1)[0])
                    
                }
                else {

                    let smaller = db.players.splice(i,1)[0]
                    
                    smaller.status = 'resting'
                    smaller.score = INITIALSCORE

                    toBeReInserted.push(smaller)

                    // inform user that they lost
                    db.websockets.forEach(socket => {
                        if (socket.uid === smaller.uid) {
                            socket.send(JSON.stringify([
                                'youareeaten',
                                bigger.name
                            ]))
                        }
                    })
                    
                }

                // ONCE FOUND COLLIDED, NO NEED TO CHECK OTHER COLLISIONS FOR THIS ENTITY
                break
            }
        }
    }

    // REINSERT INTO THE MAP
    for (let i = 0; i<toBeReInserted.length; i++) {
        insertIntoSortedArray( toBeReInserted[i], db.players)
    }

    // SESSION OVER?
    let totalScore = 0
    for (let i = 1; i<db.players.length; i++) {
        if ( db.players[i].status === 'resting') continue

        totalScore += db.players[i].score

    }

    if ( db.players[0].score > totalScore) {
        // SESSION OVER!

        let winnerName = db.players[0].name

        // ANNOUNCE THE WINNER
        db.websockets.forEach(socket => {
            for (let i = 0; i<db.players.length; i++) {
                if (db.players[i].uid === socket.uid) {
                    if (db.players[i].status === 'playing') {
                        socket.send(JSON.stringify([
                            'gameover',
                            winnerName
                        ]))
                    }
                    break
                }
            }   
        })

        // RESET ALL COORDS
        for (let i = 0; i<db.players.length; i++) {
            db.players[i].x = Infinity
            db.players[i].y = Infinity
        }

        // RESET SCORES
        for (let i = 0; i<db.players.length; i++) {
            if (db.players[i].type === 'human') {
                db.players[i].status = 'resting'
                db.players[i].score = INITIALSCORE
            }
            else {
                db.players[i].score = randomScore()
            }

            // RESET ALL COORDS
            delete db.players[i].x
            delete db.players[i].y
            placeOnTheMap(db.players[i], [db.players])

        }
        
        // SORT
        db.players.sort((a,b) => b.score - a.score )
        
    }

}, 1000/3) // 3 UPDATES PER SECOND
