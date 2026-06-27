import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUserId } from '@/lib/jwt';
import { logger } from '@/lib/logger';

// GET - List all connected devices for the user
export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const devices = await prisma.deviceConnection.findMany({
      where: { userId },
      orderBy: { lastActiveAt: 'desc' },
    });

    return NextResponse.json({ devices });
  } catch (error) {
    logger.error('Devices fetch error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Register or update a device connection
export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { deviceId, deviceName, platform, appVersion } = body;

    if (!deviceId || !deviceName) {
      return NextResponse.json(
        { error: 'deviceId and deviceName are required' },
        { status: 400 }
      );
    }

    // Check if device already exists
    const existingDevice = await prisma.deviceConnection.findUnique({
      where: { deviceId },
    });

    let device;
    if (existingDevice) {
      if (existingDevice.userId !== userId) {
        return NextResponse.json(
          { error: 'Device not found' },
          { status: 404 }
        );
      }
      // Update existing device
      device = await prisma.deviceConnection.update({
        where: { deviceId },
        data: {
          deviceName,
          platform: platform || 'Windows',
          appVersion,
          lastActiveAt: new Date(),
          lastSyncAt: new Date(),
          isActive: true,
        },
      });
    } else {
      // Create new device
      device = await prisma.deviceConnection.create({
        data: {
          userId,
          deviceId,
          deviceName,
          platform: platform || 'Windows',
          appVersion,
        },
      });
    }

    return NextResponse.json({ device });
  } catch (error) {
    logger.error('Device registration error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH - Update device (rename, deactivate)
export async function PATCH(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { deviceId, deviceName, isActive } = body;

    if (!deviceId) {
      return NextResponse.json(
        { error: 'deviceId is required' },
        { status: 400 }
      );
    }

    // Verify device belongs to user
    const device = await prisma.deviceConnection.findUnique({
      where: { deviceId },
    });

    if (!device || device.userId !== userId) {
      return NextResponse.json(
        { error: 'Device not found or unauthorized' },
        { status: 404 }
      );
    }

    // Update device
    const updatedDevice = await prisma.deviceConnection.update({
      where: { deviceId },
      data: {
        ...(deviceName && { deviceName }),
        ...(typeof isActive === 'boolean' && { isActive }),
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({ device: updatedDevice });
  } catch (error) {
    logger.error('Device update error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Disconnect/remove a device
export async function DELETE(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const deviceId = searchParams.get('deviceId');

    if (!deviceId) {
      return NextResponse.json(
        { error: 'deviceId is required' },
        { status: 400 }
      );
    }

    // Verify device belongs to user
    const device = await prisma.deviceConnection.findUnique({
      where: { deviceId },
    });

    if (!device || device.userId !== userId) {
      return NextResponse.json(
        { error: 'Device not found or unauthorized' },
        { status: 404 }
      );
    }

    // Delete device
    await prisma.deviceConnection.delete({
      where: { deviceId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Device deletion error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
