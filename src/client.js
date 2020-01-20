// import React, { useState, useContext, useEffect, createContext } from 'react'
// import { render } from 'react-dom'

import {h, Fragment, render, createContext } from 'preact'
import {useState, useContext, useEffect, useRef } from 'preact/hooks'

import { produce } from 'immer'

let context = createContext()
let websocket
// let debugTimer


let init = {
    // prevPositions: [],
    // currentPositions: [],
    positions: {}, // { [uid]: { x, y, px, py, score, name, color } }

    // origin: {
    //     x: Math.floor(window.innerWidth/2),
    //     y: Math.floor(window.innerHeight/2),
    //     scale: 1
    // },
    transitionCompletionPercentage: 0,
    // origin: {
        // x: 0,
        // y: 0,
        // scale: 10,
        // zoomLevel: 100
    // },
    // scale: 1,
    zoomLevel: 1,
    myScore: 10,
    eatenBy: null,
    winnerName: null,
    uid: null,
    ranking: [ ], // [{name,score}]
    gameState: 'name', // name, game, youareeaten, gameover, oops
    // ping: 0
}




//////////////////////////////
let act = {
    setGameState: to => produce( s => {
        s.gameState = to
    }),
    updatePositions: gp => produce( s => {
        // s.ranking = rnk
        ///////////////// !!!!!!!!!!
        // s.prevPositions = s.currentPositions
        // s.currentPositions = gp

        s.ranking = gp.filter( (p,i) => i < 10)

        for (let i = 0; i<gp.length; i++) {
            let currentUser

            for (let uid in s.positions) {

                // if (Math.random() < .00001 ) console.log(`uid ${uid} gpi ${gp[i].uid}`)
                if (gp[i].uid == uid) {
                    // console.log('!')
                    currentUser = s.positions[uid]
                    break
                }
            }

            if (currentUser) {
                // console.log('f')
                currentUser.px = currentUser.x
                currentUser.py = currentUser.y
                currentUser.x = gp[i].x
                currentUser.y = gp[i].y
                currentUser.score = gp[i].score
                currentUser.notStale = true
            }
            else {
                // console.log('nf')
                s.positions[ gp[i].uid ] = gp[i]
                gp[i].px = gp[i].x
                gp[i].py = gp[i].y
                gp[i].notStale = true
            }
        }

        if (s.positions[s.uid] && s.gameState === 'game') {
            console.log(`updatin score with ${s.positions[s.uid].score}`)
            s.myScore = s.positions[s.uid].score
        }

        for (let uid in s.positions) {
            if (!s.positions[uid].notStale) {
                // if stale
                delete s.positions[uid]
            }
            else {
                delete s.positions[uid].notStale
            }
        }
        
        
    }),
    setUid: uid => produce(s => {
        s.uid = uid
    }),
    setZoomLevel: dy => produce( s => {
        s.zoomLevel *= dy < 0 ? 1.05 : 0.95
        if (s.zoomLevel <= 1) {
            s.zoomLevel = 1
        }
        // if (s.uid) {
        //     s.scale = s.zoomLevel / Math.sqrt( .3183 * s.positions[s.uid].score )
        //     // s.scale = s.zoomLevel / s.positions[s.uid].score
        // }
        // else {
        //     s.scale = s.zoomLevel / 1
        // }
    }),
    // updatePing: newval => produce( s => {
    //     s.ping = newval
    // })
    increaseTransitionPercentage: () => produce( s => {
        s.transitionCompletionPercentage += .1
        if (s.transitionCompletionPercentage > 1) {
            s.transitionCompletionPercentage = 1
        }
    }),
    resetTransitionPercentage: () => produce( s => {
        // console.log(`reset! prc ${s.transitionCompletionPercentage}`)
        s.transitionCompletionPercentage = 0
    }),
    setEatenBy: name => produce( s => {
        s.eatenBy = name
    }),
    setWinnerName: name => produce( s => {
        s.winnerName = name
    })
}

////////////////// utils
function useInterval(callback, delay) {
    const savedCallback = useRef();
  
    // Remember the latest callback.
    useEffect(() => {
      savedCallback.current = callback;
    }, [callback]);
  
    // Set up the interval.
    useEffect(() => {
      function tick() {
        savedCallback.current();
      }
      if (delay !== null) {
        let id = setInterval(tick, delay);
        return () => clearInterval(id);
      }
    }, [delay]);

}


//////////////////////////////
render(<App />, document.getElementById('root'))
function App () {

    let [s,ss] = useState(init)

    // debug
    window._state = s
    window._setstate = ss

    // on mount
    useEffect(() => {

        // ws init
        try {
            websocket = new WebSocket(`ws://${location.host}/`)
        }
        catch(e) {
            try {
                websocket = new WebSocket(`wss://${location.host}/`)
            }
            catch(ee) {
                ss( act.setGameState('oops') )
            }
        }
    
        websocket.onerror = ev => {
            ss( act.setGameState('oops') )
        }

        websocket.onclose = ev => {
            ss( act.setGameState('oops') )
        }
    
        websocket.onmessage = encryptedMsg => {

            let msg = JSON.parse(encryptedMsg.data)
            
            if (msg[0] === 'update') {
                // console.log('!')
                ss( act.updatePositions(msg[1]) )
                ss( act.resetTransitionPercentage() )
            }
            else if (msg[0] === 'setuid') {
                // console.log(`uid: ${msg[1]}`)
                ss( act.setUid(msg[1]) )
            }
            else if (msg[0] === 'youareeaten') {
                console.log('gg')
                ss( act.setGameState('youareeaten'))
                ss( act.setEatenBy(msg[1]) )
            }
            else if (msg[0] === 'gameover') {
                console.log('go')
                ss( act.setGameState('gameover'))
                ss( act.setWinnerName( msg[1]))
            }
        }        

    }, [])


    return <context.Provider value={[s,ss]}>
        <Canvas />
        <DialogManager />
        <HallOfFame>
            {s.ranking}
        </HallOfFame>
        <Radar />
    </context.Provider>
}


///// HallOfFame
function HallOfFame({children}) {

    // let ranking = []

    // for (let uid in children) {
    //     let player = children[uid]

    //     for (let j = 0; j<10; j++) {
    //         if ( !ranking[j] ) {
    //             ranking[j] = {
    //                 name: player.name,
    //                 score: player.score
    //             }
    //             break
    //         }
    //         else {
    //             if (ranking[j].score < player.score) {
    //                 ranking.splice(j, 0, {
    //                     name: player.name,
    //                     score: player.score
    //                 })
    
    //                 ranking.splice(10, 1)
    //                 break
    //             }
    //         }
    //     }

    // }

    // let ranking = children.filter((p,i) => i < 10)


    return <div className='HallOfFame'>
    <span>HALL OF FAME</span>
    <table>
        <tbody>
        {
            children.filter((p,i) => i < 10).map( (record,id) => <tr key={id}>
                <td>
                    {record.name}
                </td>
                <td>
                    {record.score}
                </td>
            </tr>)
        }
        </tbody>
    </table>
    </div>
}


///// DialogManager
function DialogManager() {
    let [g,gg] = useContext(context)
    let [name, setName] = useState('')
    let [color, setColor] = useState('red')

    if (g.gameState === 'name') {
        return <Dialog title='WELCOME TO AGARIO' >
            <div>
                <input type="text" value={name} placeholder='Your name' onInput={handleInput} />
                    <button onClick={() => handleColorChange(-1)}> {'>'} </button>
                    <span> {color} </span>
                    <button onClick={() => handleColorChange(1)}> {'<'} </button>
            </div>
            
            <button onClick={handleStart}>
                START
            </button>
        </Dialog>
    }
    else if (g.gameState === 'oops') {
        return <Dialog title='OOPS :(' >
            <span>Something went wrong. Check your connection or try a better browser.</span>
        </Dialog>
    }
    else if (g.gameState === 'game') {
        return null
    }
    else if (g.gameState === 'youareeaten') {
        return <Dialog title='GAME OVER'>
            <div>
                You are eaten by {g.eatenBy}.
            </div>
            <div>
                Your score is {g.myScore}.
            </div>
            <button onClick={handleRestart}>
                RESTART
            </button>
        </Dialog>
    }
    else if (g.gameState === 'gameover') {
        return <Dialog title='GAME OVER'>
            <div>
                Winner: {g.winnerName}.
            </div>
            <div>
                Your score is {g.myScore}.
            </div>
            <button onClick={handleRestart}>
                RESTART
            </button>
        </Dialog>
    }

    function handleInput(ev) {
        let filterName = str => str.substr(0, 10).split('').filter(l => l.charCodeAt() >= 32 && l.charCodeAt() <= 126).join('')
        let filteredName = filterName(ev.target.value)
        ev.target.value = filteredName
        setName( filteredName )
    }

    function handleStart() {
        websocket.send(JSON.stringify([
            'start',
            name,
            color
        ]))

        gg( act.setGameState('game') )
    }

    function handleColorChange(direction) {
        let colors = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple']
        let currentIndex = colors.indexOf(color)
        let nextIndex = ( currentIndex + direction + 7 ) % 7
        setColor(colors[nextIndex])
    }

    function handleRestart() {
        websocket.send(JSON.stringify([
            'restart'
        ]))

        gg( act.setGameState('game') )
    }
}



//// Dialog
function Dialog({title, children}) {
    return <div className='Dialog'>
        <span>{title}</span>
        {children}
    </div>
}

///// Canvas
function Canvas() {
    let [g,gg] = useContext(context)
    let ref = useRef(null)
    let [leftKey, setLeftKey] = useState(0)
    let [rightKey, setRightKey] = useState(0)
    let [downKey, setDownKey] = useState(0)
    let [upKey, setUpKey] = useState(0)
    // console.log(` ^ ${upKey} v ${downKey} < ${leftKey} > ${rightKey}`)

    // first time only
    useEffect(() => {
        window.onkeydown = ev => {
            switch( ev.keyCode) {
                case 87:
                case 38:
                    upKey || setUpKey(-1)
                    break
                case 65:
                case 37:
                    leftKey || setLeftKey(-1)
                    break
                case 68:
                case 39:
                    rightKey || setRightKey(1)
                    break
                case 83:
                case 40:
                    downKey || setDownKey(1)
                    break
            }
        }

        window.onkeyup = ev => {
            switch( ev.keyCode) {
                case 87:
                case 38:
                    setUpKey(0)
                    break
                case 65:
                case 37:
                    setLeftKey(0)
                    break
                case 68:
                case 39:
                    setRightKey(0)
                    break
                case 83:
                case 40:
                    setDownKey(0)
                    break
            }
        }

        window.onwheel = ev => {
            gg( act.setZoomLevel( ev.deltaY) )
        }

    }, [])


    useInterval(() => {
        // console.log(` ^ ${upKey} v ${downKey} < ${leftKey} > ${rightKey}`)
        let horizontal = leftKey + rightKey
        let vertical = upKey + downKey

        if (horizontal || vertical) {
            websocket.send(JSON.stringify([
                'move',
                horizontal, // -1 0 1
                vertical
            ]))
        }
    }, 1000/10)

    useInterval(() => {
        gg( act.increaseTransitionPercentage() )
    }, 1000/30)

    useEffect(() => {
        let ctx = ref.current.getContext('2d')
        ctx.clearRect(0,0, window.innerWidth, window.innerHeight)

        for (let uid in g.positions) {
            drawPoop( ctx, g.positions[uid], g)
        }

        // drawRadar(ctx, g)

    })

    return <>
        <canvas className='Canvas' ref={ref} width={window.innerWidth} height={window.innerHeight} />
        {
            Object.values(g.positions).map( (player, id) => {

                // let r = Math.sqrt( .3183 * p.score ) * g.scale
                let origin = g.positions[ g.uid ] || {x: 0, y: 0, px: 0, py: 0, score: 10}
                let r = 10 * g.zoomLevel * Math.sqrt( player.score / origin.score)

                // let x = (p.x + (p.x - p.px) * g.transitionCompletionPercentage -
                // origin.x - (origin.x - origin.px) * g.transitionCompletionPercentage) * g.zoomLevel / 100 + Math.floor(window.innerWidth/2) - r * .1 * p.name.length
                // let y = (p.y + (p.y - p.py) * g.transitionCompletionPercentage -
                // origin.y - (origin.y - origin.py) * g.transitionCompletionPercentage) * g.zoomLevel / 100 + Math.floor(window.innerHeight/2) - r * 1.7

                let x = 10 * g.zoomLevel / Math.sqrt( origin.score / 3.14159265 ) *
                    ( player.px + (player.x - player.px) * g.transitionCompletionPercentage -
                    origin.px - (origin.x - origin.px) * g.transitionCompletionPercentage ) +
                    Math.floor( window.innerWidth/2) - r * .1 * player.name.length
                let y = 10 * g.zoomLevel / Math.sqrt( origin.score / 3.14159265 ) *
                    ( player.py + (player.y - player.py) * g.transitionCompletionPercentage -
                    origin.py - (origin.y - origin.py) * g.transitionCompletionPercentage ) +
                    Math.floor( window.innerHeight/2) - r * 1.7

                return <span
                key = {id}
                style={{
                    color: player.color,
                    transform: `translate(${x}px, ${y}px)`,
                    fontSize: `${r/2}px`
                }}
                >
                    {player.name}
                </span> })
        }
    </>
}



function drawPoop(ctx, player, g) {

    let hue = {
        red: 0,
        orange: 30,
        yellow: 60,
        green: 120,
        cyan: 180,
        blue: 240,
        purple: 300
    }

    ctx.lineWidth = 3
    ctx.strokeStyle = `hsl(${hue[player.color]}, 75%, 25%)`
    ctx.fillStyle = `hsl(${hue[player.color]}, 75%, 50%)`
    let origin = g.positions[ g.uid ] || {x: 0, y: 0, px: 0, py: 0, score: 10}

    // let x = (player.x + (player.x - player.px) * g.transitionCompletionPercentage -
    // origin.x - (origin.x - origin.px) * g.transitionCompletionPercentage) * g.zoomLevel / 100 + Math.floor(window.innerWidth/2)
    // let y = ( player.y + (player.y - player.py) * g.transitionCompletionPercentage -
    // origin.y - (origin.y - origin.py) * g.transitionCompletionPercentage) * g.zoomLevel / 100 + Math.floor(window.innerHeight/2)

    let x = 10 * g.zoomLevel / Math.sqrt( origin.score / 3.14159265 ) *
        ( player.px + (player.x - player.px) * g.transitionCompletionPercentage -
        origin.px - (origin.x - origin.px) * g.transitionCompletionPercentage ) +
        Math.floor( window.innerWidth/2)
    let y = 10 * g.zoomLevel / Math.sqrt( origin.score / 3.14159265 ) *
        ( player.py + (player.y - player.py) * g.transitionCompletionPercentage -
        origin.py - (origin.y - origin.py) * g.transitionCompletionPercentage ) +
        Math.floor( window.innerHeight/2)
    

    // let r = Math.sqrt( .3183 * player.score) * g.scale
    // let r = Math.sqrt( .3183 * player.score) * origin.score
    let r = 10 * g.zoomLevel * Math.sqrt( player.score / origin.score)
    let theta, dx, dy

    for (let i = 0; i<8; i++) {
        theta = i * 3.141 / 4
        dy = r * .8 * Math.sin(theta)
        dx = r * .8 * Math.cos(theta)

        ctx.beginPath()
        ctx.arc(x+dx, y+dy, r * .4, 0, 6.283)
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(x+dx, y+dy, r * .4, 0, 6.283)
        ctx.fill()
    }

    ctx.beginPath()
    ctx.arc(x, y, r, 0, 6.284)
    ctx.fill()

    dy = r * .5 * -Math.sin( .4 * 3.141) + ( player.y - player.py ) * r * .05
    dx = r * .5 * Math.cos( .4 * 3.141) + ( player.x - player.px ) * r * .05
    ctx.strokeRect(x+dx, y+dy, 0, r/3)

    dy = r * .5 * -Math.sin( .6 * 3.141) + ( player.y - player.py ) * r * .05
    dx = r * .5 * Math.cos( .6 * 3.141) + ( player.x - player.px ) * r * .05
    ctx.strokeRect(x+dx, y+dy, 0, r/3)

}


function Radar( ) {
    let [g, gg] = useContext(context)
    let ref = useRef(null)

    useEffect(() => {
        let ctx = ref.current.getContext('2d')
        ctx.clearRect(0,0, window.innerWidth, window.innerHeight)
        
        let W = 210
        ctx.strokeStyle = 'lightgray'
        ctx.fillStyle = 'black'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc( W - 110, 100, 90, 0, 6.283)
        ctx.fill()
        ctx.beginPath()
        ctx.arc( W - 110, 100, 90, 0, 6.283)
        ctx.arc( W - 110, 100, 60, 0, 6.283)
        ctx.arc( W - 110, 100, 30, 0, 6.283)
        ctx.moveTo(W - 200, 100)
        ctx.lineTo(W - 20, 100)
        ctx.moveTo(W - 110, 190)
        ctx.lineTo(W - 110, 10)
        ctx.stroke()

        // ctx.fillStyle = '#0c0'
        for (let uid in g.positions) {
            let user = g.positions[uid]
            let origin = g.positions[ g.uid ] || {x: 0, y: 0, px: 0, py: 0, score: 10}
            let px = user.x + (user.x - user.px) * g.transitionCompletionPercentage
            let py = user.y + (user.y - user.py) * g.transitionCompletionPercentage
            let ox = origin.x + (origin.x - origin.px) * g.transitionCompletionPercentage
            let oy = origin.y + (origin.y - origin.py) * g.transitionCompletionPercentage
            let dx = (px - ox > 0 ? 1 : -1) * 3 * Math.sqrt( 1+Math.abs( px - ox) ) -2
            let dy = (py - oy > 0 ? 1 : -1) * 3 * Math.sqrt( 1+Math.abs( py - oy) ) -2

            if (user.score > origin.score) {
                ctx.fillStyle = '#c00'
            }
            else {
                ctx.fillStyle = '#0c0'
            }

            if (dx**2 + dy**2 < 88**2) {
                ctx.fillRect((W - 110) + dx, 100 + dy, 4, 4)
            }
        }
    })

    return <div className='Radar'>
        <canvas ref={ref} width={200} height={200} />
    </div>
}
