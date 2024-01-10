import { BufferAttribute, BufferGeometry, ClampToEdgeWrapping, Color, FloatType, Group, InstancedBufferAttribute, InstancedMesh, LineBasicMaterial, LineSegments, MathUtils, Mesh, NearestFilter, OrthographicCamera, PlaneGeometry, RGBADepthPacking, RGBAFormat, RedFormat, SphereGeometry, Vector2, Vector3, WebGLMultipleRenderTargets, WebGLRenderTarget } from "three";
import { MeshBVH, MeshBVHUniformStruct } from "three-mesh-bvh";
import { SDFGenerator } from "./SDFGenerator.js";
import { MarchingDepthMaterial, MarchingMaterial } from "./material/MarchingMaterial.js";
import { InitMaterial } from "./material/InitMaterial.js";
import { FullScreenQuad } from "three/examples/jsm/Addons";
import { ParticleMaterial } from "./material/ParticleMaterial.js";
import { UpdateGridMaterial } from "./material/UpdateGridMaterial.js";
import { UpdateMaterial } from "./material/UpdateMaterial.js";
import { RecycleParticleMaterial } from "./material/RecycleParticleMaterial.js";
import { WetinessContext } from "./material/WetMaterial.js";
const v2_1 = new Vector2;
const _c1 = new Color;
const particleMass = 0.1;
const gravity = new Vector3(0, -9.8, 0);
const stiffness = 250;
const linkStrength = 2;
const stickyness = 3;
const dampingFactor = 0.99;
const radius = 0.02;
const formLinkDistance = radius * 2;
const breakLinkDistance = formLinkDistance * 8;
const fixedTimeStep = 1 / 60;
const gridCellSize = radius * 2;
const sdfGenerator = new SDFGenerator;
function createInstancedMesh(particleCount, positionTextureSize) {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array([0, 0, 0]), 3));
    const instanceId = new InstancedBufferAttribute(new Float32Array(particleCount * 3), 3);
    for (let i = 0; i < particleCount; i++) {
        v2_1.set(i % positionTextureSize, Math.floor(i / positionTextureSize)).addScalar(0.5).divideScalar(positionTextureSize);
        instanceId.setXYZ(i, i, v2_1.x, v2_1.y);
    }
    g.setAttribute("instanceId", instanceId);
    const m = new InstancedMesh(g, undefined, particleCount);
    m.isMesh = false;
    m.isPoints = true;
    m.frustumCulled = false;
    return m;
}
function createLinkMesh(particleCount, particleRendertargetWidth, tPosition, tLink) {
    const g = new BufferGeometry();
    const position = new BufferAttribute(new Float32Array(particleCount * 3 * 8), 3);
    const uv = new BufferAttribute(new Float32Array(particleCount * 2 * 8), 2);
    const linkIndex = new BufferAttribute(new Int32Array(particleCount * 8), 1);
    for (let i = 0; i < particleCount; i++) {
        v2_1.set(i % particleRendertargetWidth, Math.floor(i / particleRendertargetWidth)).addScalar(0.5).divideScalar(particleRendertargetWidth);
        for (let j = 0; j < 8; j++)
            uv.setXY(i * 8 + j, v2_1.x, v2_1.y);
        linkIndex.setX(i * 8, -1);
        linkIndex.setX(i * 8 + 1, 0);
        linkIndex.setX(i * 8 + 2, -1);
        linkIndex.setX(i * 8 + 3, 1);
        linkIndex.setX(i * 8 + 4, -1);
        linkIndex.setX(i * 8 + 5, 2);
        linkIndex.setX(i * 8 + 6, -1);
        linkIndex.setX(i * 8 + 7, 3);
    }
    g.setAttribute("position", position);
    g.setAttribute("uv", uv);
    g.setAttribute("linkIndex", linkIndex);
    const material = new LineBasicMaterial({
        color: 0x00ff00
    });
    material.onBeforeCompile = shader => {
        shader.uniforms.tPosition = tPosition;
        shader.uniforms.tLink = tLink;
        shader.vertexShader = `
        uniform sampler2D tPosition;
        uniform sampler2D tLink;

        attribute int linkIndex;
        ` + shader.vertexShader.replace("void main() {", `
            void main() {
                vec2 pointUv = uv;

                if( linkIndex>=0 ){
                    float id = texture2D( tLink, uv )[linkIndex];
                    if( id>=0.0 ){
                        vec2 tPositionSize = vec2(textureSize( tPosition, 0 ));
                        pointUv = (vec2(
                            mod( id, tPositionSize.x ),
                            floor( id/tPositionSize.x )
                        )+0.5)/tPositionSize;
                    }
                }

                vec3 position = texture2D( tPosition, pointUv ).xyz;
            `);
    };
    const mesh = new LineSegments(g, material);
    return mesh;
}
function createSurfaceLinkMesh(particleCount, particleRendertargetWidth, tPosition, tSurfaceLink, collders) {
    const g = new BufferGeometry();
    const position = new BufferAttribute(new Float32Array(particleCount * 3 * 8), 3);
    const uv = new BufferAttribute(new Float32Array(particleCount * 2 * 8), 2);
    const linkIndex = new BufferAttribute(new Int32Array(particleCount * 8), 1);
    for (let i = 0; i < particleCount; i++) {
        v2_1.set(i % particleRendertargetWidth, Math.floor(i / particleRendertargetWidth)).addScalar(0.5).divideScalar(particleRendertargetWidth);
        for (let j = 0; j < 8; j++)
            uv.setXY(i * 8 + j, v2_1.x, v2_1.y);
        linkIndex.setX(i * 8, -1);
        linkIndex.setX(i * 8 + 1, 0);
        linkIndex.setX(i * 8 + 2, -1);
        linkIndex.setX(i * 8 + 3, 1);
        linkIndex.setX(i * 8 + 4, -1);
        linkIndex.setX(i * 8 + 5, 2);
        linkIndex.setX(i * 8 + 6, -1);
        linkIndex.setX(i * 8 + 7, 3);
    }
    g.setAttribute("position", position);
    g.setAttribute("uv", uv);
    g.setAttribute("linkIndex", linkIndex);
    const material = new LineBasicMaterial({
        color: 0xffff00
    });
    const defines = material.defines || (material.defines = {});
    defines.NUM_BVH = collders.length;
    material.onBeforeCompile = shader => {
        shader.uniforms.tPosition = tPosition;
        shader.uniforms.tSurfaceLink = tSurfaceLink;
        shader.uniforms.bvhMatrix = { value: collders.map(m => m.matrixWorld) };
        shader.vertexShader = `
        uniform sampler2D tPosition;
        uniform sampler2D tSurfaceLink[4];
        uniform mat4 bvhMatrix[NUM_BVH];

        attribute int linkIndex;
        ` + shader.vertexShader.replace("void main() {", `
            void main() {
                vec3 position = texture2D( tPosition, uv ).xyz;                
                if( linkIndex>=0 ){
                    vec4 surfaceLinks[4] = vec4[4](
                        texture2D( tSurfaceLink[ 0 ], uv ),
                        texture2D( tSurfaceLink[ 1 ], uv ),
                        texture2D( tSurfaceLink[ 2 ], uv ),
                        texture2D( tSurfaceLink[ 3 ], uv )
                    );
                    vec4 surfaceLink = surfaceLinks[ linkIndex ];
                    int id = int( surfaceLink.w );
                    if( id>=0 ){
                        position = (bvhMatrix[id]*vec4(surfaceLink.xyz,1)).xyz;
                    }
                }

            `);
    };
    const mesh = new LineSegments(g, material);
    return mesh;
}
const fsquad = new FullScreenQuad();
const initMaterial = new InitMaterial();
const recycleParticleMaterial = new RecycleParticleMaterial();
const updateGridMaterial = new UpdateGridMaterial();
const dummyCamera = new OrthographicCamera();
export class GooSimulator extends Group {
    constructor(renderer, colliders, particleCount, gridSize = 256) {
        super();
        this.particleCount = particleCount;
        this.gridSize = gridSize;
        this.deltaTime = 0;
        this.uniforms = {
            tPosition: { value: null },
            tLink: { value: null },
            tSurfaceLink: { value: [] }
        };
        this.updateMaterial = new UpdateMaterial(colliders.length);
        const particleRendertargetWidth = MathUtils.ceilPowerOfTwo(Math.sqrt(particleCount));
        this.particleInstancedMesh = createInstancedMesh(particleCount, particleRendertargetWidth);
        this.particleRendertargets = {
            read: new WebGLMultipleRenderTargets(particleRendertargetWidth, particleRendertargetWidth, 7, {
                format: RGBAFormat,
                type: FloatType,
                minFilter: NearestFilter,
                magFilter: NearestFilter,
                generateMipmaps: false,
                wrapS: ClampToEdgeWrapping,
                wrapT: ClampToEdgeWrapping
            }),
            write: new WebGLMultipleRenderTargets(particleRendertargetWidth, particleRendertargetWidth, 7, {
                format: RGBAFormat,
                type: FloatType,
                minFilter: NearestFilter,
                magFilter: NearestFilter,
                generateMipmaps: false,
                wrapS: ClampToEdgeWrapping,
                wrapT: ClampToEdgeWrapping
            })
        };
        this.swapRendertarget();
        this.initParticle(renderer);
        const gridRenderTargetWidth = MathUtils.ceilPowerOfTwo(Math.sqrt(gridSize * gridSize * gridSize));
        this.gridRenderTarget = new WebGLRenderTarget(gridRenderTargetWidth, gridRenderTargetWidth, {
            format: RGBAFormat,
            type: FloatType,
            minFilter: NearestFilter,
            magFilter: NearestFilter,
            generateMipmaps: false,
            wrapS: ClampToEdgeWrapping,
            wrapT: ClampToEdgeWrapping
        });
        const sdfRenderTargetWidth = MathUtils.ceilPowerOfTwo(Math.pow(gridSize, 3 / 2));
        this.sdfRendertarget = new WebGLRenderTarget(sdfRenderTargetWidth, sdfRenderTargetWidth, {
            format: RedFormat,
            type: FloatType,
            minFilter: NearestFilter,
            magFilter: NearestFilter,
            generateMipmaps: false,
            wrapS: ClampToEdgeWrapping,
            wrapT: ClampToEdgeWrapping
        });
        this.colliders = colliders.map(m => {
            const bvh = new MeshBVH(m.geometry);
            const bvhUniform = new MeshBVHUniformStruct();
            bvhUniform.updateFrom(bvh);
            return {
                mesh: m,
                bvhUniform: bvhUniform,
                wetinessCtx: new WetinessContext(m, this.sdfRendertarget.texture, gridSize, gridCellSize, m.matrixWorld)
            };
        });
        const group = new Group();
        group.visible = false;
        this.add(group);
        const particleMaterial = new ParticleMaterial();
        particleMaterial.uniforms.tPosition = this.uniforms.tPosition;
        const instancedMesh = new InstancedMesh(new SphereGeometry(radius, 8, 4), particleMaterial, particleCount);
        instancedMesh.frustumCulled = false;
        instancedMesh.castShadow = false;
        instancedMesh.receiveShadow = true;
        group.add(instancedMesh);
        const linksLine = createLinkMesh(particleCount, particleRendertargetWidth, this.uniforms.tPosition, this.uniforms.tLink);
        linksLine.frustumCulled = false;
        linksLine.castShadow = false;
        linksLine.receiveShadow = false;
        group.add(linksLine);
        const surfaceLinkLine = createSurfaceLinkMesh(particleCount, particleRendertargetWidth, this.uniforms.tPosition, this.uniforms.tSurfaceLink, colliders);
        surfaceLinkLine.frustumCulled = false;
        surfaceLinkLine.castShadow = true;
        surfaceLinkLine.receiveShadow = false;
        group.add(surfaceLinkLine);
        const marchingMaterial = new MarchingMaterial(this.sdfRendertarget.texture);
        marchingMaterial.uniforms.gridSize.value = gridSize;
        marchingMaterial.uniforms.gridCellSize.value = gridCellSize;
        const marchingDepthMaterial = new MarchingDepthMaterial(this.sdfRendertarget.texture);
        marchingDepthMaterial.depthPacking = RGBADepthPacking;
        marchingDepthMaterial.uniforms.gridSize.value = gridSize;
        marchingDepthMaterial.uniforms.gridCellSize.value = gridCellSize;
        this.marchingMesh = new Mesh(new PlaneGeometry(2, 2), marchingMaterial);
        this.marchingMesh.customDepthMaterial = this.marchingMesh.customDistanceMaterial = marchingDepthMaterial;
        this.marchingMesh.castShadow = true;
        this.marchingMesh.receiveShadow = true;
        this.marchingMesh.frustumCulled = false;
        this.marchingMesh.onBeforeRender = renderer => {
            renderer.getDrawingBufferSize(marchingMaterial.uniforms.resolution.value);
        };
        this.marchingMesh.onBeforeShadow = renderer => {
            marchingDepthMaterial.uniforms.resolution.value.setScalar(renderer.getRenderTarget().width);
        };
        this.add(this.marchingMesh);
    }
    initParticle(renderer) {
        const restore = {
            rendertarget: renderer.getRenderTarget(),
            activeCubeFace: renderer.getActiveCubeFace(),
            activeMipmapLevel: renderer.getActiveMipmapLevel()
        };
        initMaterial.uniforms.radius.value = radius;
        initMaterial.uniforms.particleCount.value = this.particleCount;
        initMaterial.uniforms.rendertargetWidth.value = this.particleRendertargets.read.width;
        fsquad.material = initMaterial;
        renderer.setRenderTarget(this.particleRendertargets.read);
        fsquad.render(renderer);
        renderer.setRenderTarget(restore.rendertarget, restore.activeCubeFace, restore.activeMipmapLevel);
    }
    update(deltaTime, renderer) {
        this.deltaTime += deltaTime;
        let simulationRun = false;
        const restore = {
            rendertarget: renderer.getRenderTarget(),
            activeCubeFace: renderer.getActiveCubeFace(),
            activeMipmapLevel: renderer.getActiveMipmapLevel(),
            autoClear: renderer.autoClear,
            clearColor: renderer.getClearColor(_c1),
            clearAlpha: renderer.getClearAlpha()
        };
        while (this.deltaTime > fixedTimeStep) {
            this.simulate(fixedTimeStep, renderer);
            this.deltaTime -= fixedTimeStep;
            simulationRun = true;
        }
        renderer.setRenderTarget(restore.rendertarget, restore.activeCubeFace, restore.activeMipmapLevel);
        renderer.setClearColor(restore.clearColor, restore.clearAlpha);
        renderer.autoClear = restore.autoClear;
        if (simulationRun) {
            sdfGenerator.generate(renderer, this.sdfRendertarget, this.gridSize, gridCellSize, this.particleCount, this.uniforms.tPosition.value, this.uniforms.tLink.value, this.uniforms.tSurfaceLink.value, this.colliders, radius);
            for (let collider of this.colliders) {
                collider.wetinessCtx.update(renderer);
            }
        }
    }
    swapRendertarget() {
        const tmp = this.particleRendertargets.write;
        this.particleRendertargets.write = this.particleRendertargets.read;
        this.particleRendertargets.read = tmp;
        this.uniforms.tPosition.value = this.particleRendertargets.read.texture[0];
        this.uniforms.tLink.value = this.particleRendertargets.read.texture[2];
        this.uniforms.tSurfaceLink.value = this.particleRendertargets.read.texture.slice(3, 7);
    }
    simulate(deltaTime, renderer) {
        recycleParticleMaterial.uniforms.tInput.value = this.particleRendertargets.read.texture;
        recycleParticleMaterial.uniforms.radius.value = radius;
        fsquad.material = recycleParticleMaterial;
        renderer.setRenderTarget(this.particleRendertargets.write);
        fsquad.render(renderer);
        this.swapRendertarget();
        this.updateMaterial.uniforms.deltaTime.value = deltaTime;
        this.updateMaterial.uniforms.tInput.value = this.particleRendertargets.read.texture;
        this.updateMaterial.uniforms.radius.value = radius;
        this.updateMaterial.uniforms.formLinkDistance.value = formLinkDistance;
        this.updateMaterial.uniforms.breakLinkDistance.value = breakLinkDistance;
        this.updateMaterial.uniforms.linkStrength.value = linkStrength;
        this.updateMaterial.uniforms.stickyness.value = stickyness;
        this.updateMaterial.uniforms.stiffness.value = stiffness;
        this.updateMaterial.uniforms.particleMass.value = particleMass;
        this.updateMaterial.uniforms.gravity.value.copy(gravity);
        this.updateMaterial.uniforms.dampingFactor.value = dampingFactor;
        this.updateMaterial.uniforms.tGrid.value = this.gridRenderTarget.texture;
        this.updateMaterial.uniforms.gridSize.value = this.gridSize;
        this.updateMaterial.uniforms.gridCellSize.value = gridCellSize;
        for (let i = 0; i < this.colliders.length; i++) {
            this.updateMaterial.uniforms[`bvh${i}`].value = this.colliders[i].bvhUniform;
            this.updateMaterial.uniforms.bvhMatrix.value[i] = this.colliders[i].mesh.matrixWorld;
        }
        fsquad.material = this.updateMaterial;
        renderer.setRenderTarget(this.particleRendertargets.write);
        fsquad.render(renderer);
        this.swapRendertarget();
        updateGridMaterial.uniforms.tPosition.value = this.uniforms.tPosition.value;
        updateGridMaterial.uniforms.gridSize.value = this.gridSize;
        updateGridMaterial.uniforms.gridCellSize.value = gridCellSize;
        updateGridMaterial.uniforms.gridTextureSize.value = this.gridRenderTarget.width;
        this.particleInstancedMesh.material = updateGridMaterial;
        renderer.autoClear = true;
        renderer.setClearColor(0, 0);
        renderer.setRenderTarget(this.gridRenderTarget);
        renderer.render(this.particleInstancedMesh, dummyCamera);
    }
}
