import * as THREE from 'three';
import { AssetFactory, LockerSpec } from '@/components/bludesign/assets/AssetFactory';
import { AssetDimensions, DeviceState } from '@/components/bludesign/core/types';

describe('AssetFactory - createCustomStorageUnit', () => {
  describe('Basic locker creation', () => {
    it('should create a locker with front door', () => {
      const dimensions: AssetDimensions = {
        width: 1.524,  // 5 ft
        height: 2.4384, // 8 ft
        depth: 1.524,   // 5 ft
      };

      const lockerSpec: LockerSpec = {
        doorSide: 'front',
        doorWidth: 0.9144,  // 3 ft
        doorHeight: 1.8288, // 6 ft
        doorPositionX: 0,
        doorPositionY: 0.1524, // 0.5 ft
      };

      const locker = AssetFactory.createCustomStorageUnit(dimensions, lockerSpec);

      expect(locker).toBeInstanceOf(THREE.Group);
      expect(locker.children.length).toBe(2); // body + door
      expect(locker.userData.partNames).toEqual(['body', 'door']);
      expect(locker.userData.lockerSpec).toEqual(lockerSpec);
    });

    it('should create a locker with back door', () => {
      const dimensions: AssetDimensions = {
        width: 1.524,
        height: 2.4384,
        depth: 1.524,
      };

      const lockerSpec: LockerSpec = {
        doorSide: 'back',
        doorWidth: 0.9144,
        doorHeight: 1.8288,
        doorPositionX: 0,
        doorPositionY: 0.3048,
      };

      const locker = AssetFactory.createCustomStorageUnit(dimensions, lockerSpec);

      expect(locker).toBeInstanceOf(THREE.Group);
      expect(locker.children.length).toBe(2);
      
      // Find the door
      const door = locker.children.find(
        (child) => child instanceof THREE.Mesh && child.userData.partName === 'door'
      ) as THREE.Mesh;
      
      expect(door).toBeDefined();
      // Door should be on back side (negative Z)
      expect(door!.position.z).toBeLessThan(0);
    });

    it('should create a locker with left door', () => {
      const dimensions: AssetDimensions = {
        width: 1.524,
        height: 2.4384,
        depth: 1.524,
      };

      const lockerSpec: LockerSpec = {
        doorSide: 'left',
        doorWidth: 0.9144,
        doorHeight: 1.8288,
        doorPositionX: 0,
        doorPositionY: 0.3048,
      };

      const locker = AssetFactory.createCustomStorageUnit(dimensions, lockerSpec);

      expect(locker).toBeInstanceOf(THREE.Group);
      
      const door = locker.children.find(
        (child) => child instanceof THREE.Mesh && child.userData.partName === 'door'
      ) as THREE.Mesh;
      
      expect(door).toBeDefined();
      // Door should be on left side (negative X)
      expect(door!.position.x).toBeLessThan(0);
    });

    it('should create a locker with right door', () => {
      const dimensions: AssetDimensions = {
        width: 1.524,
        height: 2.4384,
        depth: 1.524,
      };

      const lockerSpec: LockerSpec = {
        doorSide: 'right',
        doorWidth: 0.9144,
        doorHeight: 1.8288,
        doorPositionX: 0,
        doorPositionY: 0.3048,
      };

      const locker = AssetFactory.createCustomStorageUnit(dimensions, lockerSpec);

      expect(locker).toBeInstanceOf(THREE.Group);
      
      const door = locker.children.find(
        (child) => child instanceof THREE.Mesh && child.userData.partName === 'door'
      ) as THREE.Mesh;
      
      expect(door).toBeDefined();
      // Door should be on right side (positive X)
      expect(door!.position.x).toBeGreaterThan(0);
    });
  });

  describe('Door positioning', () => {
    it('should position door at center when doorPositionX is 0', () => {
      const dimensions: AssetDimensions = {
        width: 2.0,
        height: 3.0,
        depth: 2.0,
      };

      const lockerSpec: LockerSpec = {
        doorSide: 'front',
        doorWidth: 1.0,
        doorHeight: 2.0,
        doorPositionX: 0, // Centered
        doorPositionY: 0.5,
      };

      const locker = AssetFactory.createCustomStorageUnit(dimensions, lockerSpec);
      
      const door = locker.children.find(
        (child) => child instanceof THREE.Mesh && child.userData.partName === 'door'
      ) as THREE.Mesh;
      
      expect(door).toBeDefined();
      expect(door!.position.x).toBe(0);
    });

    it('should position door left when doorPositionX is negative', () => {
      const dimensions: AssetDimensions = {
        width: 2.0,
        height: 3.0,
        depth: 2.0,
      };

      const lockerSpec: LockerSpec = {
        doorSide: 'front',
        doorWidth: 0.8,
        doorHeight: 2.0,
        doorPositionX: -0.5, // Left offset
        doorPositionY: 0.5,
      };

      const locker = AssetFactory.createCustomStorageUnit(dimensions, lockerSpec);
      
      const door = locker.children.find(
        (child) => child instanceof THREE.Mesh && child.userData.partName === 'door'
      ) as THREE.Mesh;
      
      expect(door).toBeDefined();
      expect(door!.position.x).toBe(-0.5);
    });

    it('should position door right when doorPositionX is positive', () => {
      const dimensions: AssetDimensions = {
        width: 2.0,
        height: 3.0,
        depth: 2.0,
      };

      const lockerSpec: LockerSpec = {
        doorSide: 'front',
        doorWidth: 0.8,
        doorHeight: 2.0,
        doorPositionX: 0.4, // Right offset
        doorPositionY: 0.5,
      };

      const locker = AssetFactory.createCustomStorageUnit(dimensions, lockerSpec);
      
      const door = locker.children.find(
        (child) => child instanceof THREE.Mesh && child.userData.partName === 'door'
      ) as THREE.Mesh;
      
      expect(door).toBeDefined();
      expect(door!.position.x).toBe(0.4);
    });

    it('should position door vertically based on doorPositionY', () => {
      const dimensions: AssetDimensions = {
        width: 2.0,
        height: 3.0,
        depth: 2.0,
      };

      const lockerSpec: LockerSpec = {
        doorSide: 'front',
        doorWidth: 1.0,
        doorHeight: 2.0,
        doorPositionX: 0,
        doorPositionY: 0.8, // 0.8m from bottom
      };

      const locker = AssetFactory.createCustomStorageUnit(dimensions, lockerSpec);
      
      const door = locker.children.find(
        (child) => child instanceof THREE.Mesh && child.userData.partName === 'door'
      ) as THREE.Mesh;
      
      expect(door).toBeDefined();
      // doorY = doorPositionY + doorHeight / 2
      expect(door!.position.y).toBe(0.8 + 2.0 / 2);
    });
  });

  describe('State-dependent materials', () => {
    it('should apply locked state material by default', () => {
      const dimensions: AssetDimensions = {
        width: 1.5,
        height: 2.5,
        depth: 1.5,
      };

      const lockerSpec: LockerSpec = {
        doorSide: 'front',
        doorWidth: 1.0,
        doorHeight: 2.0,
        doorPositionX: 0,
        doorPositionY: 0.5,
      };

      const locker = AssetFactory.createCustomStorageUnit(dimensions, lockerSpec);
      
      const body = locker.children.find(
        (child) => child instanceof THREE.Mesh && child.userData.partName === 'body'
      ) as THREE.Mesh;
      
      expect(body).toBeDefined();
      expect(body!.userData.stateDependent).toBe(true);
    });

    it('should accept different device states', () => {
      const dimensions: AssetDimensions = {
        width: 1.5,
        height: 2.5,
        depth: 1.5,
      };

      const lockerSpec: LockerSpec = {
        doorSide: 'front',
        doorWidth: 1.0,
        doorHeight: 2.0,
        doorPositionX: 0,
        doorPositionY: 0.5,
      };

      const states: DeviceState[] = [
        DeviceState.LOCKED,
        DeviceState.UNLOCKED,
        DeviceState.ERROR,
        DeviceState.OFFLINE,
        DeviceState.MAINTENANCE,
      ];

      states.forEach((state) => {
        const locker = AssetFactory.createCustomStorageUnit(dimensions, lockerSpec, state);
        expect(locker).toBeInstanceOf(THREE.Group);
        expect(locker.children.length).toBe(2);
      });
    });
  });

  describe('Door geometry based on side', () => {
    it('should create horizontal door for front/back sides', () => {
      const dimensions: AssetDimensions = {
        width: 2.0,
        height: 3.0,
        depth: 2.0,
      };

      const lockerSpecFront: LockerSpec = {
        doorSide: 'front',
        doorWidth: 1.5,
        doorHeight: 2.5,
        doorPositionX: 0,
        doorPositionY: 0.2,
      };

      const locker = AssetFactory.createCustomStorageUnit(dimensions, lockerSpecFront);
      
      const door = locker.children.find(
        (child) => child instanceof THREE.Mesh && child.userData.partName === 'door'
      ) as THREE.Mesh;
      
      expect(door).toBeDefined();
      const doorGeometry = (door!.geometry as THREE.BoxGeometry).parameters;
      
      // For front/back, door width is in X dimension
      expect(doorGeometry.width).toBe(1.5);
      expect(doorGeometry.height).toBe(2.5);
      expect(doorGeometry.depth).toBe(0.05); // thin door
    });

    it('should create vertical door for left/right sides', () => {
      const dimensions: AssetDimensions = {
        width: 2.0,
        height: 3.0,
        depth: 2.0,
      };

      const lockerSpecLeft: LockerSpec = {
        doorSide: 'left',
        doorWidth: 1.5,
        doorHeight: 2.5,
        doorPositionX: 0,
        doorPositionY: 0.2,
      };

      const locker = AssetFactory.createCustomStorageUnit(dimensions, lockerSpecLeft);
      
      const door = locker.children.find(
        (child) => child instanceof THREE.Mesh && child.userData.partName === 'door'
      ) as THREE.Mesh;
      
      expect(door).toBeDefined();
      const doorGeometry = (door!.geometry as THREE.BoxGeometry).parameters;
      
      // For left/right, door width is in Z dimension
      expect(doorGeometry.width).toBe(0.05); // thin door
      expect(doorGeometry.height).toBe(2.5);
      expect(doorGeometry.depth).toBe(1.5);
    });
  });

  describe('Edge cases', () => {
    it('should handle very small lockers', () => {
      const dimensions: AssetDimensions = {
        width: 0.3048,  // 1 ft
        height: 0.6096, // 2 ft
        depth: 0.3048,  // 1 ft
      };

      const lockerSpec: LockerSpec = {
        doorSide: 'front',
        doorWidth: 0.2,
        doorHeight: 0.4,
        doorPositionX: 0,
        doorPositionY: 0.1,
      };

      const locker = AssetFactory.createCustomStorageUnit(dimensions, lockerSpec);
      
      expect(locker).toBeInstanceOf(THREE.Group);
      expect(locker.children.length).toBe(2);
    });

    it('should handle very large lockers', () => {
      const dimensions: AssetDimensions = {
        width: 6.096,   // 20 ft
        height: 3.6576, // 12 ft
        depth: 9.144,   // 30 ft
      };

      const lockerSpec: LockerSpec = {
        doorSide: 'front',
        doorWidth: 3.0,
        doorHeight: 3.0,
        doorPositionX: 0,
        doorPositionY: 0.3,
      };

      const locker = AssetFactory.createCustomStorageUnit(dimensions, lockerSpec);
      
      expect(locker).toBeInstanceOf(THREE.Group);
      expect(locker.children.length).toBe(2);
    });

    it('should handle door at maximum vertical position', () => {
      const dimensions: AssetDimensions = {
        width: 2.0,
        height: 3.0,
        depth: 2.0,
      };

      const lockerSpec: LockerSpec = {
        doorSide: 'front',
        doorWidth: 1.0,
        doorHeight: 1.5,
        doorPositionX: 0,
        doorPositionY: 1.5, // Door at top
      };

      const locker = AssetFactory.createCustomStorageUnit(dimensions, lockerSpec);
      
      const door = locker.children.find(
        (child) => child instanceof THREE.Mesh && child.userData.partName === 'door'
      ) as THREE.Mesh;
      
      expect(door).toBeDefined();
      expect(door!.position.y).toBe(1.5 + 1.5 / 2);
    });
  });

  describe('Shadow casting', () => {
    it('should enable shadow casting on all meshes', () => {
      const dimensions: AssetDimensions = {
        width: 1.5,
        height: 2.5,
        depth: 1.5,
      };

      const lockerSpec: LockerSpec = {
        doorSide: 'front',
        doorWidth: 1.0,
        doorHeight: 2.0,
        doorPositionX: 0,
        doorPositionY: 0.5,
      };

      const locker = AssetFactory.createCustomStorageUnit(dimensions, lockerSpec);
      
      locker.traverse((child) => {
        if (child instanceof THREE.Mesh && child.userData.partName !== 'door') {
          expect(child.castShadow).toBe(true);
        }
      });
    });
  });

  describe('Body mesh', () => {
    it('should create body with correct dimensions', () => {
      const dimensions: AssetDimensions = {
        width: 1.524,
        height: 2.4384,
        depth: 1.524,
      };

      const lockerSpec: LockerSpec = {
        doorSide: 'front',
        doorWidth: 0.9144,
        doorHeight: 1.8288,
        doorPositionX: 0,
        doorPositionY: 0.1524,
      };

      const locker = AssetFactory.createCustomStorageUnit(dimensions, lockerSpec);
      
      const body = locker.children.find(
        (child) => child instanceof THREE.Mesh && child.userData.partName === 'body'
      ) as THREE.Mesh;
      
      expect(body).toBeDefined();
      const bodyGeometry = (body!.geometry as THREE.BoxGeometry).parameters;
      
      expect(bodyGeometry.width).toBe(dimensions.width);
      expect(bodyGeometry.height).toBe(dimensions.height);
      expect(bodyGeometry.depth).toBe(dimensions.depth);
    });

    it('should position body at correct height', () => {
      const dimensions: AssetDimensions = {
        width: 1.5,
        height: 2.5,
        depth: 1.5,
      };

      const lockerSpec: LockerSpec = {
        doorSide: 'front',
        doorWidth: 1.0,
        doorHeight: 2.0,
        doorPositionX: 0,
        doorPositionY: 0.5,
      };

      const locker = AssetFactory.createCustomStorageUnit(dimensions, lockerSpec);
      
      const body = locker.children.find(
        (child) => child instanceof THREE.Mesh && child.userData.partName === 'body'
      ) as THREE.Mesh;
      
      expect(body).toBeDefined();
      // Body should be positioned so its bottom is at y=0
      expect(body!.position.y).toBe(dimensions.height / 2);
    });
  });
});

