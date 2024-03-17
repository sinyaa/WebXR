import { WebXRButton } from '../util/webxr-button.js'
import { Scene } from '../render/scenes/scene.js'
import { Node } from '../render/core/node.js'
import { UrlTexture, VideoTexture } from '../render/core/texture.js'

import { Renderer, createWebGLContext } from '../render/core/renderer.js'
import { SkyboxNode } from '../render/nodes/skybox.js'
import { BoxBuilder } from '../render/geometry/box-builder.js'
import { SphereBuilder } from '../render/geometry/sphere-builder.js'
import { PbrMaterial } from '../render/materials/pbr.js'
import { VideoMaterial } from '../render/nodes/video.js'
import { mat4, vec3 } from '../render/math/gl-matrix.js'
import { textureRoot, availableTextures } from '../custom/environments.js'

import { Ray } from '../render/math/ray.js'

console.log('Loading pre-requsites')

// XR globals.
let xrButton = null
let xrRefSpace = null
let isAR = false
const radii = new Float32Array(25)
const positions = new Float32Array(16 * 25)
let rayEnabled = false
let rayDelay = Date.now()

// Boxes
let boxes_left = []
let boxes_right = []
let boxes = { left: boxes_left, right: boxes_right }
const indexFingerBoxes = { left: null, right: null }
const thumbBoxes = { left: null, right: null }
const defaultBoxColor = { r: 0.5, g: 0.5, b: 0.5 }
const leftBoxColor = { r: 1, g: 0, b: 1 }
const rightBoxColor = { r: 0, g: 1, b: 1 }
let interactionBox = null
let leftInteractionBox = null
let rightInteractionBox = null
let current = 0
let currentTry = Date.now()
let gl = null
let renderer = null
const scene = new Scene()
let currentSkyboxNode = new SkyboxNode({ url: textureRoot + availableTextures[0].name + '.png' })
scene.addNode(currentSkyboxNode)
scene.enableStats(false)

function replaceSkyboxNode () {
  const timeNow = Date.now()
  const passedSeconds = (timeNow - currentTry) / 1000

  if (passedSeconds < 10) return
  currentTry = timeNow

  current++
  if (current > availableTextures.length - 1) current = 0
  const newTexture = availableTextures[current].name
  // Step 1: Remove the existing SkyboxNode from the scene
  if (currentSkyboxNode) {
    scene.removeNode(currentSkyboxNode)
  } else {
    console.warn('No existing SkyboxNode found to replace.')
    return // Exit if there's nothing to replace
  }

  // Step 2: Create a new SkyboxNode with the new texture
  const newSkyboxNode = new SkyboxNode({ url: textureRoot + newTexture + '.png' })

  // Step 3: Add the new SkyboxNode to the scene
  scene.addNode(newSkyboxNode)

  // Optionally, update your reference to the current SkyboxNode
  currentSkyboxNode = newSkyboxNode
}

function createBoxPrimitive (r, g, b) {
  const boxBuilder = new BoxBuilder()
  boxBuilder.pushCube([0, 0, 0], 1)
  const boxPrimitive = boxBuilder.finishPrimitive(renderer)
  const boxMaterial = new PbrMaterial()
  boxMaterial.baseColorFactor.value = [r, g, b, 1]
  return renderer.createRenderPrimitive(boxPrimitive, boxMaterial)
}

function createSpherePrimitive (r, g, b) {
  const sphereBuilder = new SphereBuilder()
  sphereBuilder.pushUnitSphere()
  const spherePrimitive = sphereBuilder.finishPrimitive(renderer)
  const material = new PbrMaterial()
  material.baseColorFactor.value = [r, g, b, 1]
  return renderer.createRenderPrimitive(spherePrimitive, material)
}

function createVideoSpherePrimitive (r, g, b) {
  const sphereBuilder = new SphereBuilder()
  sphereBuilder.pushUnitSphere([0, 0, 0], 1.0, 32) // Assuming SphereBuilder exists and works as intended
  const spherePrimitive = sphereBuilder.finishPrimitive(renderer)
  // let material = new PbrMaterial();

  const video = document.createElement('video')
  video.src = '/assets/textures/videos/v1.mp4' // Adjust the path to your video file
  video.loop = true
  video.muted = true // Necessary for autoplay in most browsers
  video.autoplay = true // Optional, depending on your use case
  video.load() // Start loading the video

  const videoTexture = new VideoTexture(video)
  const material = new VideoMaterial()
  material.image.texture = videoTexture
  material.baseColorFactor.value = [r, g, b, 0, 5]
  return renderer.createRenderPrimitive(spherePrimitive, material)
}

function createImageSpherePrimitive (r, g, b) {
  const sphereBuilder = new SphereBuilder()
  sphereBuilder.pushUnitSphere([0, 0, 0], 1.0, 32) // Assuming SphereBuilder exists and works as intended
  const spherePrimitive = sphereBuilder.finishPrimitive(renderer)
  const material = new PbrMaterial()
  const texture = new UrlTexture('assets/textures/map.png')
  material.baseColor.texture = texture
  // material.baseColorFactor = [0.0, 0.843, 1.0, 0.4]; // Gold color, RGBA
  return renderer.createRenderPrimitive(spherePrimitive, material)
}

function addSphere (x, y, z, r, g, b, offset) {
  const renderPrimitive = createSpherePrimitive(r, g, b)
  const node = new Node()
  node.addRenderPrimitive(renderPrimitive)
  // Marks the node as one that needs to be checked when hit testing.
  node.selectable = true
  return node
}

function addBox (x, y, z, r, g, b, offset) {
  const boxRenderPrimitive = createBoxPrimitive(r, g, b)
  const boxNode = new Node()
  boxNode.addRenderPrimitive(boxRenderPrimitive)
  // Marks the node as one that needs to be checked when hit testing.
  boxNode.selectable = true
  return boxNode
}

function initHands () {
  for (const box of boxes_left) {
    scene.removeNode(box)
  }
  for (const box of boxes_right) {
    scene.removeNode(box)
  }
  boxes_left = []
  boxes_right = []
  boxes = { left: boxes_left, right: boxes_right }
  if (typeof XRHand !== 'undefined') {
    for (let i = 0; i <= 24; i++) {
      const r = 0.6 + Math.random() * 0.4
      const g = 0.6 + Math.random() * 0.4
      const b = 0.6 + Math.random() * 0.4
      boxes_left.push(addBox(0, 0, 0, r, g, b))
      boxes_right.push(addBox(0, 0, 0, r, g, b))
    }
  }
  if (indexFingerBoxes.left) {
    scene.removeNode(indexFingerBoxes.left)
  }
  if (indexFingerBoxes.right) {
    scene.removeNode(indexFingerBoxes.right)
  }
  indexFingerBoxes.left = addBox(0, 0, 0, leftBoxColor.r, leftBoxColor.g, leftBoxColor.b)
  indexFingerBoxes.right = addBox(0, 0, 0, rightBoxColor.r, rightBoxColor.g, rightBoxColor.b)

  if (thumbBoxes.left) {
    scene.removeNode(thumbBoxes.left)
  }
  if (thumbBoxes.right) {
    scene.removeNode(thumbBoxes.right)
  }

  thumbBoxes.left = addBox(0, 0, 0, leftBoxColor.r, leftBoxColor.g, leftBoxColor.b)
  thumbBoxes.right = addBox(0, 0, 0, rightBoxColor.r, rightBoxColor.g, rightBoxColor.b)
}

// Checks to see if WebXR is available and, if so, queries a list of
// XRDevices that are connected to the system.
function initXR () {
  // Adds a helper button to the page that indicates if any XRDevices are
  // available and let's the user pick between them if there's multiple.
  xrButton = new WebXRButton({
    onRequestSession,
    onEndSession
  })
  document.querySelector('#entervr').appendChild(xrButton.domElement)

  // Is WebXR available on this UA?
  if (navigator.xr) {
    // If the device allows creation of exclusive sessions set it as the
    // target of the 'Enter XR' button.
    navigator.xr.isSessionSupported('immersive-vr').then((supported) => {
      if (supported) { xrButton.enabled = supported } else {
        navigator.xr.isSessionSupported('immersive-ar').then((supported) => {
          isAR = true
          xrButton.enabled = supported
        })
      }
    })
  }
}

// Called when the user selects a device to present to. In response we
// will request an exclusive session from that device.
function onRequestSession () {
  return navigator.xr.requestSession(isAR ? 'immersive-ar' : 'immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] }).then(onSessionStarted)
}

// Called when we've successfully acquired a XRSession. In response we
// will set up the necessary session state and kick off the frame loop.
function onSessionStarted (session) {
  // This informs the 'Enter XR' button that the session has started and
  // that it should display 'Exit XR' instead.
  xrButton.setSession(session)

  // Listen for the sessions 'end' event so we can respond if the user
  // or UA ends the session for any reason.
  session.addEventListener('end', onSessionEnded)

  session.addEventListener('visibilitychange', e => {
    // remove hand controller while blurred
    if (e.session.visibilityState === 'visible-blurred') {
      for (const box of boxes.left) {
        scene.removeNode(box)
      }
      for (const box of boxes.right) {
        scene.removeNode(box)
      }
    }
  })

  // Create a WebGL context to render with, initialized to be compatible
  // with the XRDisplay we're presenting to.
  gl = createWebGLContext({
    xrCompatible: true
  })

  // Create a renderer with that GL context (this is just for the samples
  // framework and has nothing to do with WebXR specifically.)
  renderer = new Renderer(gl)

  initHands()

  // Set the scene's renderer, which creates the necessary GPU resources.
  scene.setRenderer(renderer)

  // Use the new WebGL context to create a XRWebGLLayer and set it as the
  // sessions baseLayer. This allows any content rendered to the layer to
  // be displayed on the XRDevice.
  session.updateRenderState({ baseLayer: new XRWebGLLayer(session, gl) })

  // Get a frame of reference, which is required for querying poses. In
  // this case an 'local' frame of reference means that all poses will
  // be relative to the location where the XRDevice was first detected.
  session.requestReferenceSpace('local').then((refSpace) => {
    xrRefSpace = refSpace.getOffsetReferenceSpace(new XRRigidTransform({ x: 0, y: 0, z: 0 }))

    // Inform the session that we're ready to begin drawing.
    session.requestAnimationFrame(onXRFrame)
  })
}

// Called when the user clicks the 'Exit XR' button. In response we end
// the session.
function onEndSession (session) {
  session.end()
}

// Called either when the user has explicitly ended the session (like in
// onEndSession()) or when the UA has ended the session for any reason.
// At this point the session object is no longer usable and should be
// discarded.
function onSessionEnded (event) {
  xrButton.setSession(null)

  // In this simple case discard the WebGL context too, since we're not
  // rendering anything else to the screen with it.
  renderer = null
}

function updateInputSources (session, frame, refSpace) {
  if (session.visibilityState === 'visible-blurred') {
    return
  }
  for (const inputSource of session.inputSources) {
    const targetRayPose = frame.getPose(inputSource.targetRaySpace, refSpace)
    if (targetRayPose) {
      if ((inputSource.targetRayMode == 'tracked-pointer') && rayEnabled) {
        scene.inputRenderer.addLaserPointer(targetRayPose.transform)
      }

      const targetRay = new Ray(targetRayPose.transform)
      const cursorDistance = 2.0
      const cursorPos = vec3.fromValues(
        targetRay.origin.x,
        targetRay.origin.y,
        targetRay.origin.z
      )
      vec3.add(cursorPos, cursorPos, [
        targetRay.direction.x * cursorDistance,
        targetRay.direction.y * cursorDistance,
        targetRay.direction.z * cursorDistance
      ])

      scene.inputRenderer.addCursor(cursorPos)
    }

    let offset = 0
    if (!inputSource.hand) {
      continue
    } else {
      for (const box of boxes[inputSource.handedness]) {
        scene.removeNode(box)
      }

      const pose = frame.getPose(inputSource.targetRaySpace, refSpace)
      if (pose === undefined) {
        console.log('no pose')
      }

      if (!frame.fillJointRadii(inputSource.hand.values(), radii)) {
        console.log('no fillJointRadii')
        continue
      }
      if (!frame.fillPoses(inputSource.hand.values(), refSpace, positions)) {
        console.log('no fillPoses')
        continue
      }
      for (const box of boxes[inputSource.handedness]) {
        scene.addNode(box)
        const matrix = positions.slice(offset * 16, (offset + 1) * 16)
        const jointRadius = radii[offset]
        offset++
        mat4.getTranslation(box.translation, matrix)
        mat4.getRotation(box.rotation, matrix)
        box.scale = [jointRadius, jointRadius, jointRadius]
      }

      // Render a special box for each index finger on each hand
      const indexFingerBox = indexFingerBoxes[inputSource.handedness]
      scene.addNode(indexFingerBox)
      const joint = inputSource.hand.get('index-finger-tip')
      const jointPose = frame.getJointPose(joint, xrRefSpace)
      if (jointPose) {
        const matrix = jointPose.transform.matrix
        mat4.getTranslation(indexFingerBox.translation, matrix)
        mat4.getRotation(indexFingerBox.rotation, matrix)
        indexFingerBox.scale = [0.01, 0.01, 0.01]
      }

      // Render a special box for each thumb on each hand
      const thubmBox = thumbBoxes[inputSource.handedness]
      scene.addNode(thubmBox)
      const thumb_joint = inputSource.hand.get('thumb-tip')
      const thumb_jointPose = frame.getJointPose(thumb_joint, xrRefSpace)
      if (thumb_jointPose) {
        const matrix = thumb_jointPose.transform.matrix
        mat4.getTranslation(thubmBox.translation, matrix)
        mat4.getRotation(thubmBox.rotation, matrix)
        thubmBox.scale = [0.02, 0.02, 0.02]
      }
    }
  }
}

function UpdateInteractables (time) {
  // Add scene objects if not present
  if (!interactionBox) {
    function AddInteractionSphere (r, g, b) {
      const sphere = new Node()
      sphere.addRenderPrimitive(createImageSpherePrimitive(r, g, b))
      sphere.translation = [0, 0.0, 0.65]
      sphere.scale = [0.20, 0.20, 0.20]
      return sphere
    }

    interactionBox = AddInteractionSphere(defaultBoxColor.r, defaultBoxColor.g, defaultBoxColor.b)
    leftInteractionBox = AddInteractionSphere(leftBoxColor.r, leftBoxColor.g, leftBoxColor.b)
    rightInteractionBox = AddInteractionSphere(rightBoxColor.r, rightBoxColor.g, rightBoxColor.b)
    scene.addNode(interactionBox)
    scene.addNode(leftInteractionBox)
    scene.addNode(rightInteractionBox)
  }

  function Distance (nodeA, nodeB) {
    return Math.sqrt(
      Math.pow(nodeA.translation[0] - nodeB.translation[0], 2) +
            Math.pow(nodeA.translation[1] - nodeB.translation[1], 2) +
            Math.pow(nodeA.translation[2] - nodeB.translation[2], 2))
  }

  // Perform distance check on interactable elements
  const interactionDistance = interactionBox.scale[0]
  leftInteractionBox.visible = false
  rightInteractionBox.visible = false
  if (Distance(indexFingerBoxes.left, interactionBox) < interactionDistance) {
    leftInteractionBox.visible = true
  } else if (Distance(indexFingerBoxes.right, interactionBox) < interactionDistance) {
    rightInteractionBox.visible = true
  }

  if (Distance(thumbBoxes.right, indexFingerBoxes.right) < indexFingerBoxes.right.scale[0]) {
    replaceSkyboxNode()
  }

  if (Distance(indexFingerBoxes.left, thumbBoxes.left) < indexFingerBoxes.left.scale[0]) {
    const timeNow = Date.now()
    const passedSeconds = (timeNow - rayDelay)

    if (passedSeconds > 1500) {
      rayDelay = timeNow
      rayEnabled = !rayEnabled
    }
  }

  interactionBox.visible = !(leftInteractionBox.visible || rightInteractionBox.visible)

  mat4.rotateX(interactionBox.matrix, interactionBox.matrix, time / 1000)
  mat4.rotateY(interactionBox.matrix, interactionBox.matrix, time / 1500)
  leftInteractionBox.matrix = interactionBox.matrix
  rightInteractionBox.matrix = interactionBox.matrix
}

// Called every time the XRSession requests that a new frame be drawn.
function onXRFrame (t, frame) {
  const session = frame.session

  // Per-frame scene setup. Nothing WebXR specific here.
  scene.startFrame()

  // Inform the session that we're ready for the next frame.
  session.requestAnimationFrame(onXRFrame)

  updateInputSources(session, frame, xrRefSpace)
  UpdateInteractables(t)

  // Get the XRDevice pose relative to the Frame of Reference we created
  // earlier.
  const pose = frame.getViewerPose(xrRefSpace)

  // Getting the pose may fail if, for example, tracking is lost. So we
  // have to check to make sure that we got a valid pose before attempting
  // to render with it. If not in this case we'll just leave the
  // framebuffer cleared, so tracking loss means the scene will simply
  // disappear.
  if (pose) {
    const glLayer = session.renderState.baseLayer

    // If we do have a valid pose, bind the WebGL layer's framebuffer,
    // which is where any content to be displayed on the XRDevice must be
    // rendered.
    gl.bindFramebuffer(gl.FRAMEBUFFER, glLayer.framebuffer)

    // Clear the framebuffer
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

    // Loop through each of the views reported by the frame and draw them
    // into the corresponding viewport.
    for (const view of pose.views) {
      const viewport = glLayer.getViewport(view)
      gl.viewport(viewport.x, viewport.y,
        viewport.width, viewport.height)

      // Draw this view of the scene. What happens in this function really
      // isn't all that important. What is important is that it renders
      // into the XRWebGLLayer's framebuffer, using the viewport into that
      // framebuffer reported by the current view, and using the
      // projection matrix and view transform from the current view.
      // We bound the framebuffer and viewport up above, and are passing
      // in the appropriate matrices here to be used when rendering.
      scene.draw(view.projectionMatrix, view.transform)
    }
  } else {
    // There's several options for handling cases where no pose is given.
    // The simplest, which these samples opt for, is to simply not draw
    // anything. That way the device will continue to show the last frame
    // drawn, possibly even with reprojection. Alternately you could
    // re-draw the scene again with the last known good pose (which is now
    // likely to be wrong), clear to black, or draw a head-locked message
    // for the user indicating that they should try to get back to an area
    // with better tracking. In all cases it's possible that the device
    // may override what is drawn here to show the user it's own error
    // message, so it should not be anything critical to the application's
    // use.
  }

  // Per-frame scene teardown. Nothing WebXR specific here.
  scene.endFrame()
}

// Start the XR application.
initXR()
console.log('Init complete')
