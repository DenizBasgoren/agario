// import React, { useState, useContext, useEffect, createContext } from 'react'
// import { render } from 'react-dom'

import {h, Fragment, render, createContext } from 'preact'
import {useState, useContext, useEffect, useRef } from 'preact/hooks'

import { produce } from 'immer'

let context = createContext()
let websocket
let debugTimer


let init = {
    currentPositions: [],
    // origin: {
    //     x: Math.floor(window.innerWidth/2),
    //     y: Math.floor(window.innerHeight/2),
    //     scale: 1
    // },
    origin: {
        x: 0,
        y: 0,
        scale: 10,
        scaleFactor: 100
    },
    uid: null,
    ranking: [ ], // [{name,score}]
    gameState: 'name', // name, game, gameover, disconnected, oops
    // ping: 0
}




//////////////////////////////
let act = {
    setGameState: to => produce( s => {
        s.gameState = to
    }),
    updatePositionsAndRanking: (gp, rnk) => produce( s => {
        s.ranking = rnk
        s.currentPositions = gp
        
        if (s.uid) {
            for (let i = 0; i<gp.length; i++) {
                if (gp[i].uid === s.uid) {
                    s.origin.x = gp[i].x
                    s.origin.y = gp[i].y
                    s.origin.scale = s.origin.scaleFactor / Math.log(gp[i].score) ///// !!!! should depend on score
                    break
                }
            }
        }
        else {
            s.origin.x = 0
            s.origin.y = 0
            s.origin.scale = s.origin.scaleFactor / 10
        }
    }),
    setUid: uid => produce(s => {
        s.uid = uid
    }),
    setScalingFactor: dy => produce( s => {
        s.origin.scaleFactor -= dy
        if (s.origin.scaleFactor <= 0) {
            s.origin.scaleFactor = 1
        }
    }),
    // updatePing: newval => produce( s => {
    //     s.ping = newval
    // })
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
    
        websocket.onmessage = encryptedMsg => {

            let msg = JSON.parse(encryptedMsg.data)
            
            if (msg[0] === 'update') {
                // console.log(`positions`)
                // console.log(msg[1])
                ss( act.updatePositionsAndRanking(msg[1], msg[2]) )
                console.clear()
                console.log( new Date().getTime() - debugTimer )
                debugTimer = new Date().getTime()
            }
            if (msg[0] === 'setuid') {
                console.log(`uid: ${msg[1]}`)
                ss( act.setUid(msg[1]) )
            }
        }        

    }, [])


    return <context.Provider value={[s,ss]}>
        <Canvas />
        <DialogManager />
        <HallOfFame>
            {s.ranking}
        </HallOfFame>
    </context.Provider>
}


///// HallOfFame
function HallOfFame({children}) {
    return <div className='HallOfFame'>
    <span>HALL OF FAME</span>
    <table>
        <tbody>
        {
            children.map( (record,id) => <tr key={id}>
                <td>
                    {id+1}
                </td>
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
    let [color, setColor] = useState('orange')

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
            <span>Your browser doesn't support this game.</span>
        </Dialog>
    }
    else if (g.gameState === 'game') {
        return null
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
            gg( act.setScalingFactor( ev.deltaY) )
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
    }, 1000/20)

    useEffect(() => {
        let ctx = ref.current.getContext('2d')
        ctx.clearRect(0,0, window.innerWidth, window.innerHeight)

        for (let i = 0; i<g.currentPositions.length; i++) {
            drawPoop( ctx, g.currentPositions[i], g.origin)
        }

        drawRadar(ctx, g.currentPositions, g.origin)

        // window.onmousemove = ev => {
        //     console.log(`${ev.clientX}, ${ev.clientY}`)
        // }
    })

    return <>
        <canvas className='Canvas' ref={ref} width={window.innerWidth} height={window.innerHeight} />
        {
            g.currentPositions.map( p => {

                let r = Math.log( p.score ) * g.origin.scale
                let x = (p.x - g.origin.x) * g.origin.scaleFactor / 100 + Math.floor(window.innerWidth/2) - r * .1 * p.name.length
                let y = (p.y - g.origin.y) * g.origin.scaleFactor / 100 + Math.floor(window.innerHeight/2) - r * 1.7

                return <span
                style={{
                    color: p.color,
                    transform: `translate(${x}px, ${y}px)`,
                    fontSize: `${r/2}px`
                }}
                >
                    {p.name}
                </span> })
        }
    </>
}

function drawRadar(ctx, positions, origin) {
    ctx.strokeStyle = 'lightgray'
    ctx.fillStyle = 'gray'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc( window.innerWidth - 110, 100, 90, 0, 6.283)
    ctx.fill()
    ctx.beginPath()
    ctx.arc( window.innerWidth - 110, 100, 90, 0, 6.283)
    ctx.arc( window.innerWidth - 110, 100, 60, 0, 6.283)
    ctx.arc( window.innerWidth - 110, 100, 30, 0, 6.283)
    ctx.moveTo(window.innerWidth - 200, 100)
    ctx.lineTo(window.innerWidth - 20, 100)
    ctx.moveTo(window.innerWidth - 110, 190)
    ctx.lineTo(window.innerWidth - 110, 10)
    ctx.stroke()

    ctx.fillStyle = '#0c0'
    for (let i = 0; i<positions.length; i++) {
        let px = positions[i].x
        let py = positions[i].y
        let ox = origin.x
        let oy = origin.y
        let dx = (px - ox > 0 ? 1 : -1) *10*Math.log( 1+Math.abs( px - ox) ) -2
        let dy = (py - oy > 0 ? 1 : -1) *10 *Math.log( 1+Math.abs( py - oy) ) -2

        if (dx**2 + dy**2 < 88**2) {
            ctx.fillRect((window.innerWidth - 110) + dx, 100 + dy, 4, 4)
        }
    }
}


function drawPoop(ctx, player, origin) {

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

    let x = (player.x - origin.x) * origin.scaleFactor / 100 + Math.floor(window.innerWidth/2)
    let y = ( player.y - origin.y) * origin.scaleFactor / 100 + Math.floor(window.innerHeight/2)
    let r = Math.log(player.score) * origin.scale
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

    dy = r * .5 * -Math.sin( .4 * 3.141)
    dx = r * .5 * Math.cos( .4 * 3.141)
    ctx.strokeRect(x+dx, y+dy, 0, r/3)

    dy = r * .5 * -Math.sin( .6 * 3.141)
    dx = r * .5 * Math.cos( .6 * 3.141)
    ctx.strokeRect(x+dx, y+dy, 0, r/3)

}
