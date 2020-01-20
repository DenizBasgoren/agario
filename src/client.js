
import {h, Fragment, render, createContext } from 'preact'
import {useState, useContext, useEffect, useRef } from 'preact/hooks'

import { produce } from 'immer'

let context = createContext()
let websocket

// INITIAL GLOBAL STATE
let init = {
    positions: {}, // { [uid]: { x, y, px, py, score, name, color } }
    transitionCompletionPercentage: 0,
    zoomLevel: 5,
    myScore: 10,
    eatenBy: null,
    winnerName: null,
    uid: null,
    ranking: [ ], // [{name,score}]
    gameState: 'name', // name, game, youareeaten, gameover, oops
}


// PRODUCTIONS ( GLOBAL STATE CHANGING FUNCTIONS )
let prod = {
    setGameState: to => produce( s => {
        s.gameState = to
    }),
    updatePositions: gp => produce( s => {

        // positions are always sorted, so first 10 are top 10
        s.ranking = gp.filter( (p,i) => i < 10)

        // convert from [{uid, ...}] to {[uid]: {...}} format
        for (let i = 0; i<gp.length; i++) {
            let currentUser

            for (let uid in s.positions) {

                if (gp[i].uid == uid) {
                    currentUser = s.positions[uid]
                    break
                }
            }

            // if an already registered user
            if (currentUser) {
                currentUser.px = currentUser.x
                currentUser.py = currentUser.y
                currentUser.x = gp[i].x
                currentUser.y = gp[i].y
                currentUser.score = gp[i].score
                currentUser.notStale = true
            }
            else { // or a new one
                s.positions[ gp[i].uid ] = gp[i]
                gp[i].px = gp[i].x
                gp[i].py = gp[i].y
                gp[i].notStale = true
            }
        }

        // if me, save my score
        if (s.positions[s.uid] && s.gameState === 'game') {
            s.myScore = s.positions[s.uid].score
        }

        // delete stale records (eaten ones)
        for (let uid in s.positions) {
            if (!s.positions[uid].notStale) {
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
    }),
    // ones current position is determined by (current pt - prev pt) * transitionPercentage
    // this creates an illusion of movement
    increaseTransitionPercentage: () => produce( s => {
        s.transitionCompletionPercentage += .1
        if (s.transitionCompletionPercentage > 1) {
            s.transitionCompletionPercentage = 1
        }
    }),
    // once server returns new coords, reset to 0
    resetTransitionPercentage: () => produce( s => {
        s.transitionCompletionPercentage = 0
    }),
    setEatenBy: name => produce( s => {
        s.eatenBy = name
    }),
    setWinnerName: name => produce( s => {
        s.winnerName = name
    })
}

// UTILS
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


// RENDER APP COMPONENT
render(<App />, document.getElementById('root'))

// APP COMPONENT
function App () {

    // BY CONVENTION,
    // S = LOCAL STATE, SS = SET LOCAL STATE
    // G = GLOBAL STATE, GG = SET GLOBAL STATE
    let [s,ss] = useState(init)

    // FOR DEBUG PURPOSES, YOU CAN REACT GLOBAL STATE AND SET STATE THRU THESE VARS
    window._state = s
    window._setstate = ss

    // only once
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
                ss( prod.setGameState('oops') )
            }
        }
    
        websocket.onerror = ev => {
            ss( prod.setGameState('oops') )
        }

        websocket.onclose = ev => {
            ss( prod.setGameState('oops') )
        }
    
        websocket.onmessage = encryptedMsg => {

            let msg = JSON.parse(encryptedMsg.data)
            
            // 0TH ITEM ALWAYS IS MSG TYPE
            if (msg[0] === 'update') {
                ss( prod.updatePositions(msg[1]) )
                ss( prod.resetTransitionPercentage() )
            }
            else if (msg[0] === 'setuid') {
                ss( prod.setUid(msg[1]) )
            }
            else if (msg[0] === 'youareeaten') {
                ss( prod.setGameState('youareeaten'))
                ss( prod.setEatenBy(msg[1]) )
            }
            else if (msg[0] === 'gameover') {
                ss( prod.setGameState('gameover'))
                ss( prod.setWinnerName( msg[1]))
            }
        }        

    }, [])

    // PASS APP STATE AND SETSTATE THRU CONTEXT, SO THAT IT IS CHANGEABLE EVERYWHERE
    // IT WILL BE REFERENCED AS [G,GG] ON CHILDREN
    return <context.Provider value={[s,ss]}>
        <Canvas />
        <DialogManager />
        <HallOfFame>
            {s.ranking}
        </HallOfFame>
        <Radar />
    </context.Provider>
}


// COMPONENTS
function HallOfFame({children}) {

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

function DialogManager() {
    let [g,gg] = useContext(context)
    let [name, setName] = useState(window.localStorage.name || '')
    let [color, setColor] = useState( window.localStorage.color || 'red')

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

    // handlers
    function handleInput(ev) {
        let filterName = str => str.substr(0, 10).split('').filter(l => l.charCodeAt() >= 32 && l.charCodeAt() <= 126).join('')
        let filteredName = filterName(ev.target.value)
        ev.target.value = filteredName
        setName( filteredName )
        window.localStorage.name = filteredName
    }

    function handleStart() {
        websocket.send(JSON.stringify([
            'start',
            name,
            color
        ]))

        gg( prod.setGameState('game') )
    }

    function handleColorChange(direction) {
        let colors = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple']
        let currentIndex = colors.indexOf(color)
        let nextIndex = ( currentIndex + direction + 7 ) % 7
        setColor(colors[nextIndex])
        window.localStorage.color = colors[nextIndex]
    }

    function handleRestart() {
        websocket.send(JSON.stringify([
            'restart'
        ]))

        gg( prod.setGameState('game') )
    }
}


function Dialog({title, children}) {
    return <div className='Dialog'>
        <span>{title}</span>
        {children}
    </div>
}

function Canvas() {
    let [g,gg] = useContext(context)
    let ref = useRef(null)
    let [leftKey, setLeftKey] = useState(0)
    let [rightKey, setRightKey] = useState(0)
    let [downKey, setDownKey] = useState(0)
    let [upKey, setUpKey] = useState(0)

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
            gg( prod.setZoomLevel( ev.deltaY) )
        }

    }, [])

    // SEND COORDS AT 10FPS
    useInterval(() => {
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
        gg( prod.increaseTransitionPercentage() )
    }, 1000/30)

    useEffect(() => {
        let ctx = ref.current.getContext('2d')
        ctx.clearRect(0,0, window.innerWidth, window.innerHeight)

        for (let uid in g.positions) {
            drawPlayers( ctx, g.positions[uid], g)
        }
    })

    return <>
        <canvas className='Canvas' ref={ref} width={window.innerWidth} height={window.innerHeight} />
        {
            Object.values(g.positions).map( (player, id) => {

                // M A T H
                let origin = g.positions[ g.uid ] || {x: 0, y: 0, px: 0, py: 0, score: 10}
                let r = 10 * g.zoomLevel * Math.sqrt( player.score / origin.score)

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



function drawPlayers(ctx, player, g) {

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

    let x = 10 * g.zoomLevel / Math.sqrt( origin.score / 3.14159265 ) *
        ( player.px + (player.x - player.px) * g.transitionCompletionPercentage -
        origin.px - (origin.x - origin.px) * g.transitionCompletionPercentage ) +
        Math.floor( window.innerWidth/2)
    let y = 10 * g.zoomLevel / Math.sqrt( origin.score / 3.14159265 ) *
        ( player.py + (player.y - player.py) * g.transitionCompletionPercentage -
        origin.py - (origin.y - origin.py) * g.transitionCompletionPercentage ) +
        Math.floor( window.innerHeight/2)
    
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
