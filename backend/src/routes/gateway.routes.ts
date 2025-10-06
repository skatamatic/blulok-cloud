import { Router, Response } from 'express';
import { GatewayModel } from '../models/gateway.model';
import { authenticateToken } from '../middleware/auth.middleware';
import { UserRole, AuthenticatedRequest } from '../types/auth.types';
import { asyncHandler } from '../middleware/error.middleware';

const router = Router();
const gatewayModel = new GatewayModel();

// Apply auth middleware to all routes
router.use(authenticateToken);

// POST /api/gateways - Create new gateway
router.post('/', asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const user = req.user!;
  
  // Only admins and dev admins can create gateways
  if (user.role !== UserRole.ADMIN && user.role !== UserRole.DEV_ADMIN) {
    res.status(403).json({ 
      success: false, 
      message: 'Insufficient permissions. Only administrators can create gateways.' 
    });
    return;
  }

  const gatewayData = req.body;
  const gateway = await gatewayModel.create(gatewayData);
  
  res.status(201).json({ 
    success: true, 
    gateway 
  });
}));

// GET /api/gateways - Get all gateways
router.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const user = req.user!;
  
  // TENANT and MAINTENANCE users cannot access gateways
  if (user.role === UserRole.TENANT || user.role === UserRole.MAINTENANCE) {
    res.status(403).json({ 
      success: false, 
      message: 'Access denied. Tenants and maintenance users cannot access gateways.' 
    });
    return;
  }
  
  const gateways = await gatewayModel.findAll();
  
  // Filter by facility access if user is facility-scoped
  let filteredGateways = gateways;
  if (user.role === UserRole.FACILITY_ADMIN && user.facilityIds) {
    // Filter gateways to only those belonging to user's facilities
    filteredGateways = gateways.filter(gateway => 
      user.facilityIds!.includes(gateway.facility_id)
    );
  }
  
  res.json({ 
    success: true, 
    gateways: filteredGateways 
  });
}));

// GET /api/gateways/:id - Get specific gateway
router.get('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const user = req.user!;
  const id = req.params.id as string;
  
  // TENANT and MAINTENANCE users cannot access gateways
  if (user.role === UserRole.TENANT || user.role === UserRole.MAINTENANCE) {
    res.status(403).json({ 
      success: false, 
      message: 'Access denied. Tenants and maintenance users cannot access gateways.' 
    });
    return;
  }
  
  const gateway = await gatewayModel.findById(String(id));
  
  if (!gateway) {
    res.status(404).json({ 
      success: false, 
      message: 'Gateway not found' 
    });
    return;
  }

  // Check facility access for FACILITY_ADMIN users
  if (user.role === UserRole.FACILITY_ADMIN && user.facilityIds) {
    if (!user.facilityIds.includes(gateway.facility_id)) {
      res.status(403).json({ 
        success: false, 
        message: 'Access denied. You can only access gateways in your assigned facilities.' 
      });
      return;
    }
  }

  res.json({ 
    success: true, 
    gateway 
  });
}));

// PUT /api/gateways/:id - Update gateway
router.put('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const user = req.user!;
  const id = req.params.id as string;
  
  // Only admins and dev admins can update gateways
  if (user.role !== UserRole.ADMIN && user.role !== UserRole.DEV_ADMIN) {
    res.status(403).json({ 
      success: false, 
      message: 'Insufficient permissions. Only administrators can update gateways.' 
    });
    return;
  }

  const gatewayData = req.body;
  const gateway = await gatewayModel.update(String(id), gatewayData);
  
  if (!gateway) {
    res.status(404).json({ 
      success: false, 
      message: 'Gateway not found' 
    });
    return;
  }

  res.json({ 
    success: true, 
    gateway 
  });
}));

// PUT /api/gateways/:id/status - Update gateway status
router.put('/:id/status', asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const user = req.user!;
  const id = req.params.id as string;
  const { status } = req.body as { status: string };
  
  // TENANT and MAINTENANCE users cannot update gateway status
  if (user.role === UserRole.TENANT || user.role === UserRole.MAINTENANCE) {
    res.status(403).json({ 
      success: false, 
      message: 'Access denied. Tenants and maintenance users cannot update gateway status.' 
    });
    return;
  }
  
  // Check if gateway exists and user has access
  const gateway = await gatewayModel.findById(String(id));
  if (!gateway) {
    res.status(404).json({ 
      success: false, 
      message: 'Gateway not found' 
    });
    return;
  }
  
  // Check facility access for FACILITY_ADMIN users
  if (user.role === UserRole.FACILITY_ADMIN && user.facilityIds) {
    if (!user.facilityIds.includes(gateway.facility_id)) {
      res.status(403).json({ 
        success: false, 
        message: 'Access denied. You can only update gateways in your assigned facilities.' 
      });
      return;
    }
  }
  
  await gatewayModel.updateStatus(String(id), status as any);
  
  res.json({ 
    success: true, 
    message: 'Gateway status updated successfully' 
  });
}));

export { router as gatewayRouter };

