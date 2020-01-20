
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
const HUMANSPEED = 3
const SPAWNAREA = 500
const TOTALBOTS = 100

repl.start({ useGlobal: true})

///   db
let db
db = global.db = {
    players: randomBots(TOTALBOTS).sort((a,b) => b.score - a.score ),
    websockets: new Set()
}


// util
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
    return Math.floor( (Math.random() + 1) ** 13)
}


function randomBots(n) {
    let bots = []

    while (bots.length < n) {

        let bot = {
            name: '',
            type: 'bot', // bot human
            status: 'playing', // playing resting
            name: randomName(),
            score: randomScore(),
            color: ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple'][Math.floor(Math.random() * 7)],
            uid: Math.floor(Math.random() * 10**15 )
        }

        let k = 1

        while ( !bot.x || !bot.y ) {
            let x = Math.random() * k * 2 * SPAWNAREA - k * SPAWNAREA
            let y = Math.random() * k * 2 * SPAWNAREA - k * SPAWNAREA

            let collision = false
            for (let i = 0; i<bots.length; i++) {
                if (distance({x,y}, bots[i]) < Math.sqrt( .3183 * bot.score) + Math.sqrt( .3183 * bots[i].score) + 10) {
                    collision = true
                    // console.log('col')
                    break
                }
            }

            if (db && db.players) {
                for (let i = 0; i<db.players.length; i++) {
                    if (db.players[i].status === 'resting') continue
                    if (distance({x,y}, db.players[i]) < Math.sqrt( .3183 * bot.score) + Math.sqrt( .3183 * db.players[i].score) + 10) {
                        collision = true
                        // console.log('col')
                        break
                    }
                }
            }

            if (!collision) {
                bot.x = x
                bot.y = y
            }

            if (Math.random() < .05) k++
        }

        // if (bots.length === 0) {
        //     bot.x = 0,
        //     bot.y = 0
        // }
        // else if (bots.length === 1) {
        //     bot.x = 100,
        //     bot.y = 100
        // }
        // else {
        //     let mostDistantX = bots[0].x
        //     let mostDistantY = bots[0].y

        //     for (let i = 0; i<bots.length; i++) {
        //         if (Math.abs(bots[i].x) > mostDistantX ) {
        //             mostDistantX = Math.abs(bots[i].x)
        //         }
        //         if (Math.abs(bots[i].y) > mostDistantY ) {
        //             mostDistantY = Math.abs(bots[i].y)
        //         }
        //     }

        //     let collision
        //     do {
        //         collision = false
        //         bot.x = Math.random() * (2*mostDistantX+1600) - (mostDistantX+80000)
        //         bot.y = Math.random() * (2*mostDistantY+160000) - (mostDistantY+80000)

        //         // console.log(`len ${bots.length} x ${bot.x.toFixed(2)} y ${bot.y.toFixed(2)} `)
        //         for (let i = 0; i<bots.length; i++) {
        //             if ( distance(bot, bots[i]) < bot.score + bots[i].score + 20) {
        //                 collision = true
        //                 break
        //             }
        //         }

        //     } while ( collision )
            
        // }

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

// function botMove(botIndex) {
//     if (db.players.length === 1) return randomMove()

//     let closestEnemyIndex = 0
//     let closestEnemyDistance = distance( db.players[0], db.players[botIndex])
//     let closestTargetIndex = 0
//     let closestTargetDistance = closestEnemyDistance

//     for (let i = 0; i< db.players.length; i++) {
//         if (i === botIndex) continue

//         let dist = distance( db.players[i], db.players[botIndex])
//         // enemy
//         if (db.players[i].score > db.players[i].score) {
//             if ( dist < closestEnemyDistance) {
//                 closestEnemyIndex = i
//                 closestEnemyDistance = dist
//             }
//         }
//         else {
//             if ( dist < closestTargetDistance) {
//                 closestTargetIndex = i
//                 closestTargetDistance = dist
//             }
//         }
//     }

//     // gonna attack
//     if (closestEnemyDistance > closestTargetDistance) {
//         return {
//             x: db.players[closestTargetIndex].x - db.players[botIndex].x > 0 ? 1 : -1,
//             y: db.players[closestTargetIndex].y - db.players[botIndex].y > 0 ? 1 : -1,
//         }
//     }
//     else {
//         return {
//             x: db.players[closestTargetIndex].x - db.players[botIndex].x > 0 ? -1 : 1,
//             y: db.players[closestTargetIndex].y - db.players[botIndex].y > 0 ? -1 : 1,
//         }
//     }
// }

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
    let fourthLetter = ['', '', 'ng']

    for (let i = 0; i<2; i++) {
        name += firstLetter[ Math.floor(Math.random() * firstLetter.length) ]
        name += secondLetter[ Math.floor(Math.random() * secondLetter.length) ]
        name += thirdLetter[ Math.floor(Math.random() * thirdLetter.length) ]
        name += fourthLetter[ Math.floor(Math.random() * fourthLetter.length) ]
    }
    return name
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
                name: filterName( msg[1] ) || randomName(),
                color: msg[2],
                score: INITIALSCORE,
                type: 'human',
                status: 'playing', // playing resting
                uid: Math.floor(Math.random() * 10**15 )
            }

            // let mostDistantX = db.players[0].x
            // let mostDistantY = db.players[0].y

            // for (let i = 0; i<db.players.length; i++) {
            //     if (Math.abs(db.players[i].x) > mostDistantX ) {
            //         mostDistantX = Math.abs(db.players[i].x)
            //     }
            //     if (Math.abs(db.players[i].y) > mostDistantY ) {
            //         mostDistantY = Math.abs(db.players[i].y)
            //     }
            // }

            // let collision
            // do {
            //     collision = false
            //     player.x = Math.random() * (2*mostDistantX+80) - (mostDistantX+40)
            //     player.y = Math.random() * (2*mostDistantY+80) - (mostDistantY+40)

            //     for (let i = 0; i<db.players.length; i++) {
            //         if ( distance(player, db.players[i]) < player.score + db.players[i].score + 20) {
            //             collision = true
            //             break
            //         }
            //     }

            // } while ( collision )
            

            let k = 1

            while ( !player.x || !player.y ) {
                let x = Math.random() * k * 2 * SPAWNAREA - k * SPAWNAREA
                let y = Math.random() * k * 2 * SPAWNAREA - k * SPAWNAREA

                let collision = false
                for (let i = 0; i<db.players.length; i++) {
                    if (db.players[i].status === 'resting') continue
                    if (distance({x,y}, db.players[i]) < Math.sqrt( .3183 * player.score) + Math.sqrt( .3183 * db.players[i].score) + 10) {
                        collision = true
                        break
                    }
                }

                if (!collision) {
                    player.x = x
                    player.y = y
                }

                if (Math.random() < .05) k++
            }


            // db.players.push(player)
            insertIntoSortedArray(player, db.players)
            socket.uid = player.uid
            // updateRanking(player)

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

                    db.players[i].x += msg[1] * HUMANSPEED * (msg[1] && msg[2] ? .7 : 1)
                    db.players[i].y += msg[2] * HUMANSPEED * (msg[1] && msg[2] ? .7 : 1)
                    break
                }
            }
        }

        else if (msg[0] === 'restart') {

            /// DEBUG
            // console.log('restart???')

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
            let k = 1

            while ( !player.x || !player.y ) {
                let x = Math.random() * k * 2 * SPAWNAREA - k * SPAWNAREA
                let y = Math.random() * k * 2 * SPAWNAREA - k * SPAWNAREA

                let collision = false
                for (let i = 0; i<db.players.length; i++) {
                    if (db.players[i].status === 'resting') continue
                    if (distance({x,y}, db.players[i]) < Math.sqrt( .3183 * player.score) + Math.sqrt( .3183 * db.players[i].score) + 10) {
                        collision = true
                        break
                    }
                }

                if (!collision) {
                    player.x = x
                    player.y = y
                }

                if (Math.random() < .05) k++
            }
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

// function updateRanking(player) {
//     for (let j = 0; j<10; j++) {
//         if ( !db.rankings[j] ) {
//             db.rankings[j] = {
//                 name: player.name,
//                 score: player.score
//             }
//             break
//         }
//         else {
//             if (db.rankings[j].score < player.score) {
//                 db.rankings.splice(j, 0, {
//                     name: player.name,
//                     score: player.score
//                 })

//                 db.rankings.splice(10, 1)
//                 break
//             }
//         }
//     }
// }

// LOOP
setInterval( function serverLoop () {
    
    if (db.websockets.size === 0) return

    // movements
    for (let i = 0; i< db.players.length; i++) {
        if (db.players[i].type === 'bot') {
            // let move = randomMove()
            let move = botMove( i )

            // register move
            db.players[i].x += move.x * BOTSPEED * ( move.x && move.y ? .7 : 1)
            db.players[i].y += move.y * BOTSPEED * ( move.x && move.y ? .7 : 1)
        }
    }

    //send updates
    // let ranking = db.players.filter((p,i) => i < 10).map(p => ({name: p.name, score: p.score}))
    db.websockets.forEach(socket => {
        socket.send(JSON.stringify([
            'update',
            db.players.filter(p => p.status === 'playing').map(p => {
                return { x: p.x, y: p.y, score: p.score, name: p.name, color: p.color, uid: p.uid}
            }),
            // ranking
        ]))
    })

    ////////

    // collision detection
    let toBeReInserted = []

    smalls:
    for (let i = 1; i<db.players.length; i++) {

        if (db.players[i].status === 'resting') {
            // if (db.players[i].name === 'k') console.log( 'resting')
            continue
        }

        // if (db.players[i].status === 'resting') {
        //     console.log('wtf')
        // }

        // if (db.players[i].status === 'resting') console.log('i out wtf ?!?!?!?!?!?!?!')


        for (let j = 0; j<i; j++) {

            // if (db.players[i].status === 'resting') console.log('i in wtf ?!?!?!?!?!?!?!')

            // DEBUG
            // if (db.players[i].name === 'k' && db.players[i].status === 'resting') {
            //     console.log(`i ${db.players[i].name} j ${db.players[j].name}`)
            // }
            // if (db.players[j].name === 'k' && db.players[j].status === 'resting') {
            //     console.log('???')
            // }

            if (db.players[j].status === 'resting') {
                // if (db.players[j].name === 'k') console.log( new Date().getTime() )
                continue
            }

            // if (db.players[i].status === 'resting') console.log('i wtf ?!?!?!?!?!?!?!')
            // if (db.players[j].status === 'resting') console.log('j wtf ?!?!?!?!?!?!?!')

            // console.log(`pi`)
            // console.log(db.players[i])

            if ( distance( db.players[i], db.players[j]) < Math.sqrt( .3183 * db.players[i].score) + Math.sqrt( .3183 * db.players[j].score)) {

                // collision detected

                /*
                // let big, small
                let bigIndex, smallIndex
                if (db.players[i].score > db.players[j].score ) {
                    bigIndex = i
                    smallIndex = j
                    // big = db.players[bigIndex]
                    // small = db.players[smallIndex]
                }
                else {
                    bigIndex = j
                    smallIndex = i
                    // big = db.players[bigIndex]
                    // small = db.players[smallIndex]
                }
                */

                // bigger = j, smaller = i

                ///// DEBUG
                // let N = db.players[i].status

                db.players[j].score += db.players[i].score

                // let DEBUG1 = db.players[i].name

                let bigger = db.players.splice(j, 1)[0]
                insertIntoSortedArray( bigger, db.players)

                // if (DEBUG1 !== db.players[i].name) console.log(`i before ${DEBUG1} i after: ${db.players[i].name}`)

                // updateRanking( db.players[smallIndex] )

                if (db.players[i].type === 'bot') {
                    // new bot
                    // db.players[smallIndex] = randomBots(1)[0]

                    // if (db.players[i].status === 'resting' || db.players[j].status === 'resting') console.log('?!?!?!')
                    db.players.splice(i, 1)
                    toBeReInserted.push(randomBots(1)[0])

                    
                    // insertIntoSortedArray(randomBots(1)[0], db.players)
                }
                else {

                    // DEBUG
                    // if (db.players[i].status === 'resting' && db.players[i].name === 'k') {
                    //     console.log(`!! ${N}`)
                    // }
                    // if (db.players[i].status === 'resting' || db.players[j].status === 'resting') console.log('?!?!?!')
                    // console.log(`i ${db.players[i].name} st ${db.players[i].status} j ${db.players[j].name}`)

                    let smaller = db.players.splice(i,1)[0]
                    
                    smaller.status = 'resting'
                    smaller.score = INITIALSCORE

                    toBeReInserted.push(smaller)
                    // insertIntoSortedArray(smaller, db.players)

                    // db.players[smallIndex].status = 'resting'
                    // db.players[smallIndex].score = INITIALSCORE
                    /////////// inform user that they lost

                    db.websockets.forEach(socket => {
                        if (socket.uid === smaller.uid) {
                            socket.send(JSON.stringify([
                                'youareeaten',
                                bigger.name
                            ]))
                        }
                    })
                    
                }

                break
            }
        }
    }

    // reinsert
    for (let i = 0; i<toBeReInserted.length; i++) {
        // console.log('check')
        // console.log(toBeReInserted[i])
        insertIntoSortedArray( toBeReInserted[i], db.players)
    }

    // session over?

    // let totalScore = 0, biggestIndex = 0, biggestScore = 0
    let totalScore = 0
    for (let i = 1; i<db.players.length; i++) {
        if ( db.players[i].status === 'resting') continue

        totalScore += db.players[i].score

        // if (db.players[i].score > biggestScore) {
        //     biggestScore = db.players[i].score
        //     biggestIndex = i
        // }
    }

    if ( db.players[0].score > totalScore) {
        // game over

        let winnerName = db.players[0].name

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

        // reset all pts
        for (let i = 0; i<db.players.length; i++) {
            if (db.players[i].type === 'human') {
                // console.log(db.players[i])

                db.players[i].score = INITIALSCORE
                db.players[i].status = 'resting'
            }
            else {
                db.players[i].score = randomScore()
            }
        }
        
        db.players.sort((a,b) => b.score - a.score )
        
    }

}, 1000/3)
