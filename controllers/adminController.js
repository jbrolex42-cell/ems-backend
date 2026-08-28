const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const User = require('../models/User');
const Emergency = require('../models/Emergency');
const Ambulance = require('../models/Ambulance');
const Hospital = require('../models/Hospital');
const Membership = require('../models/Membership');
const Donation = require('../models/Donation');

const getDashboardStats = async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const [
      totalUsers,
      totalEmergencies,
      activeAmbulances,
      todayEmergencies,
      activeMembers,
      pendingEmergencies,
      completedToday,
      criticalActive,
      weekEmergencies,
      monthEmergencies,
    ] = await Promise.all([
      User.countDocuments({
        role: 'patient',
        isActive: true,
      }),

      Emergency.countDocuments({
        isDeleted: false,
      }),

      Ambulance.countDocuments({
        status: 'available',
        isActive: true,
      }),

      Emergency.countDocuments({
        createdAt: {
          $gte: today,
        },
      }),

      Membership.countDocuments({
        status: 'active',
      }),

      Emergency.countDocuments({
        status: {
          $in: [
            'pending',
            'dispatched',
            'enroute',
            'on_scene',
            'transporting',
          ],
        },
      }),

      Emergency.countDocuments({
        status: 'completed',
        createdAt: {
          $gte: today,
        },
      }),

      Emergency.countDocuments({
        severity: 'critical',
        status: {
          $nin: ['completed', 'cancelled'],
        },
      }),

      Emergency.countDocuments({
        createdAt: {
          $gte: weekAgo,
        },
      }),

      Emergency.countDocuments({
        createdAt: {
          $gte: monthAgo,
        },
      }),
    ]);

    const [
      monthlyTrend,
      typeBreakdown,
      countyStats,
      severityBreakdown,
      avgResponse,
      shaClaims,
    ] = await Promise.all([
      Emergency.aggregate([
        {
          $match: {
            createdAt: {
              $gte: sixMonthsAgo,
            },
            isDeleted: false,
          },
        },
        {
          $group: {
            _id: {
              month: {
                $month: '$createdAt',
              },
              year: {
                $year: '$createdAt',
              },
            },
            count: {
              $sum: 1,
            },
          },
        },
        {
          $sort: {
            '_id.year': 1,
            '_id.month': 1,
          },
        },
      ]),

      Emergency.aggregate([
        {
          $match: {
            isDeleted: false,
          },
        },
        {
          $group: {
            _id: '$type',
            count: {
              $sum: 1,
            },
          },
        },
        {
          $sort: {
            count: -1,
          },
        },
      ]),

      Emergency.aggregate([
        {
          $match: {
            'patientLocation.county': {
              $exists: true,
              $ne: '',
            },
            isDeleted: false,
          },
        },
        {
          $group: {
            _id: '$patientLocation.county',
            count: {
              $sum: 1,
            },
          },
        },
        {
          $sort: {
            count: -1,
          },
        },
        {
          $limit: 10,
        },
      ]),

      Emergency.aggregate([
        {
          $match: {
            isDeleted: false,
          },
        },
        {
          $group: {
            _id: '$severity',
            count: {
              $sum: 1,
            },
          },
        },
      ]),

      Emergency.aggregate([
        {
          $match: {
            responseTime: {
              $exists: true,
              $gt: 0,
            },
            isDeleted: false,
          },
        },
        {
          $group: {
            _id: null,
            avgTime: {
              $avg: '$responseTime',
            },
          },
        },
      ]),

      Emergency.aggregate([
        {
          $match: {
            shaVerified: true,
            isDeleted: false,
          },
        },
        {
          $group: {
            _id: '$shaClaimStatus',
            count: {
              $sum: 1,
            },
          },
        },
      ]),
    ]);

    res.json({
      success: true,
      stats: {
        totalUsers,
        totalEmergencies,
        activeAmbulances,
        todayEmergencies,
        activeMembers,
        pendingEmergencies,
        completedToday,
        criticalActive,
        weekEmergencies,
        monthEmergencies,
        avgResponseTime: avgResponse[0]
          ? Math.round(avgResponse[0].avgTime)
          : 0,
      },
      monthlyTrend,
      typeBreakdown,
      countyStats,
      severityBreakdown,
      shaClaims,
    });
  } catch (error) {
    next(error);
  }
};

/* =========================================================
   USERS
========================================================= */

const getAllUsers = async (req, res, next) => {
  try {
    const {
      role,
      page = 1,
      limit = 20,
      search,
      isActive,
      county,
    } = req.query;

    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const limitNumber = Math.min(
      Math.max(parseInt(limit, 10) || 20, 1),
      100
    );

    const query = {};

    if (role) {
      query.role = role;
    }

    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    if (county) {
      query['address.county'] = county;
    }

    if (search) {
      query.$or = [
        {
          firstName: {
            $regex: search,
            $options: 'i',
          },
        },
        {
          lastName: {
            $regex: search,
            $options: 'i',
          },
        },
        {
          email: {
            $regex: search,
            $options: 'i',
          },
        },
        {
          phone: {
            $regex: search,
            $options: 'i',
          },
        },
      ];
    }

    const skip = (pageNumber - 1) * limitNumber;

    const [users, total] = await Promise.all([
      User.find(query)
        .select('-password -refreshToken -resetPasswordToken')
        .sort({
          createdAt: -1,
        })
        .skip(skip)
        .limit(limitNumber),

      User.countDocuments(query),
    ]);

    res.json({
      success: true,
      users,
      total,
      page: pageNumber,
      pages: Math.ceil(total / limitNumber),
    });
  } catch (error) {
    next(error);
  }
};

const getSingleUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select(
      '-password -refreshToken -resetPasswordToken'
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const [emergencies, membership] = await Promise.all([
      Emergency.find({
        patient: req.params.id,
      })
        .sort({
          createdAt: -1,
        })
        .limit(10),

      Membership.findOne({
        user: req.params.id,
        status: 'active',
      }),
    ]);

    res.json({
      success: true,
      user,
      emergencies,
      membership,
    });
  } catch (error) {
    next(error);
  }
};

const updateUser = async (req, res, next) => {
  try {
    const allowedFields = [
      'role',
      'isActive',
      'isVerified',
    ];

    const updates = {};

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    const user = await User.findByIdAndUpdate(
      req.params.id,
      updates,
      {
        new: true,
        runValidators: true,
      }
    ).select('-password -refreshToken -resetPasswordToken');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.json({
      success: true,
      message: 'User updated successfully',
      user,
    });
  } catch (error) {
    next(error);
  }
};

const deleteUser = async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      {
        isActive: false,
      },
      {
        new: true,
      }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.json({
      success: true,
      message: 'User deactivated successfully',
    });
  } catch (error) {
    next(error);
  }
};

/* =========================================================
   EMERGENCIES
========================================================= */

const getAllEmergencies = async (req, res, next) => {
  try {
    const {
      status,
      severity,
      county,
      type,
      page = 1,
      limit = 20,
      startDate,
      endDate,
    } = req.query;

    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);

    const limitNumber = Math.min(
      Math.max(parseInt(limit, 10) || 20, 1),
      100
    );

    const query = {
      isDeleted: false,
    };

    if (status) {
      query.status = status;
    }

    if (severity) {
      query.severity = severity;
    }

    if (type) {
      query.type = type;
    }

    if (county) {
      query['patientLocation.county'] = {
        $regex: county,
        $options: 'i',
      };
    }

    if (startDate || endDate) {
      query.createdAt = {};

      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }

      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        query.createdAt.$lte = end;
      }
    }

    const skip = (pageNumber - 1) * limitNumber;

    const [emergencies, total] = await Promise.all([
      Emergency.find(query)
        .populate(
          'patient',
          'firstName lastName phone shaNumber'
        )
        .populate(
          'emt',
          'firstName lastName'
        )
        .populate(
          'ambulance',
          'registrationNumber type'
        )
        .populate(
          'hospital',
          'name'
        )
        .sort({
          createdAt: -1,
        })
        .skip(skip)
        .limit(limitNumber),

      Emergency.countDocuments(query),
    ]);

    res.json({
      success: true,
      emergencies,
      total,
      page: pageNumber,
      pages: Math.ceil(total / limitNumber),
    });
  } catch (error) {
    next(error);
  }
};

const getAdminEmergency = async (req, res, next) => {
  try {
    const emergency = await Emergency.findById(
      req.params.id
    )
      .populate(
        'patient',
        'firstName lastName phone email bloodGroup allergies medicalConditions shaNumber idNumber emergencyContacts'
      )
      .populate(
        'emt',
        'firstName lastName phone'
      )
      .populate('ambulance')
      .populate('hospital');

    if (!emergency) {
      return res.status(404).json({
        success: false,
        message: 'Emergency not found',
      });
    }

    res.json({
      success: true,
      emergency,
    });
  } catch (error) {
    next(error);
  }
};

const reassignAmbulance = async (req, res, next) => {
  try {
    const { ambulanceId } = req.body;

    if (!ambulanceId) {
      return res.status(400).json({
        success: false,
        message: 'Ambulance ID is required',
      });
    }

    const emergency = await Emergency.findById(
      req.params.id
    );

    if (!emergency) {
      return res.status(404).json({
        success: false,
        message: 'Emergency not found',
      });
    }

    const ambulance = await Ambulance.findById(
      ambulanceId
    );

    if (!ambulance) {
      return res.status(404).json({
        success: false,
        message: 'Ambulance not found',
      });
    }

    if (emergency.ambulance) {
      await Ambulance.findByIdAndUpdate(
        emergency.ambulance,
        {
          status: 'available',
        }
      );
    }

    emergency.ambulance = ambulance._id;
    emergency.emt = ambulance.emt;

    emergency.timeline.push({
      status: emergency.status,
      note: `Ambulance reassigned by admin to ${ambulance.registrationNumber}`,
    });

    await emergency.save();

    await Ambulance.findByIdAndUpdate(
      ambulance._id,
      {
        status: 'dispatched',
      }
    );

    const io = req.app.get('io');

    if (io) {
      io.to(`emergency_${emergency._id}`).emit(
        'ambulance_reassigned',
        {
          registration: ambulance.registrationNumber,
        }
      );
    }

    res.json({
      success: true,
      message: 'Ambulance reassigned successfully',
      emergency,
    });
  } catch (error) {
    next(error);
  }
};

/* =========================================================
   AMBULANCE FLEET
========================================================= */

const getAmbulanceFleet = async (req, res, next) => {
  try {
    const {
      county,
      status,
      type,
    } = req.query;

    const query = {
      isActive: true,
    };

    if (county) {
      query.county = county;
    }

    if (status) {
      query.status = status;
    }

    if (type) {
      query.type = type;
    }

    const [
      ambulances,
      stats,
      statsByCounty,
    ] = await Promise.all([
      Ambulance.find(query)
        .populate(
          'driver',
          'firstName lastName phone'
        )
        .populate(
          'emt',
          'firstName lastName phone'
        )
        .select('+location +lastPing')
        .sort({
          status: 1,
          county: 1,
        }),

      Ambulance.aggregate([
        {
          $match: {
            isActive: true,
          },
        },
        {
          $group: {
            _id: '$status',
            count: {
              $sum: 1,
            },
          },
        },
      ]),

      Ambulance.aggregate([
        {
          $match: {
            isActive: true,
          },
        },
        {
          $group: {
            _id: {
              county: '$county',
              status: '$status',
            },
            count: {
              $sum: 1,
            },
          },
        },
        {
          $sort: {
            '_id.county': 1,
          },
        },
      ]),
    ]);

    res.json({
      success: true,
      ambulances,
      stats,
      statsByCounty,
    });
  } catch (error) {
    next(error);
  }
};

const createAmbulance = async (req, res, next) => {
  try {
    const {
      registrationNumber,
      type,
      county,
      status,
      emt,
      driver,
      equipment,
      capacity,
      notes,
    } = req.body;

    if (
      !registrationNumber ||
      !type ||
      !county
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Registration number, type and county are required',
      });
    }

    const normalizedRegistration =
      registrationNumber.toUpperCase();

    const existing = await Ambulance.findOne({
      registrationNumber: normalizedRegistration,
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message:
          'An ambulance with this registration already exists',
      });
    }

    const ambulance = await Ambulance.create({
      registrationNumber: normalizedRegistration,
      type,
      county,
      status: status || 'available',
      emt: emt || null,
      driver: driver || null,
      equipment: equipment || [],
      capacity: capacity || 2,
      notes: notes || '',
      isActive: true,
      location: {
        type: 'Point',
        coordinates: [0, 0],
      },
    });

    const populatedAmbulance =
      await Ambulance.findById(
        ambulance._id
      )
        .populate(
          'emt',
          'firstName lastName phone'
        )
        .populate(
          'driver',
          'firstName lastName phone'
        );

    res.status(201).json({
      success: true,
      message: 'Ambulance created successfully',
      ambulance: populatedAmbulance,
    });
  } catch (error) {
    next(error);
  }
};

const updateAmbulanceLocation = async (
  req,
  res,
  next
) => {
  try {
    const { coordinates, status } = req.body;

    const ambulanceId = req.params.id;

    if (
      !ambulanceId ||
      ambulanceId === 'undefined'
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Ambulance ID is missing. Make sure ambulanceId is set on the EMT user account.',
      });
    }

    if (
      !Array.isArray(coordinates) ||
      coordinates.length !== 2
    ) {
      return res.status(400).json({
        success: false,
        message:
          'coordinates must be [longitude, latitude]',
      });
    }

    const updates = {
      location: {
        type: 'Point',
        coordinates,
      },
      lastPing: new Date(),
    };

    if (status) {
      updates.status = status;
    }

    const ambulance =
      await Ambulance.findByIdAndUpdate(
        ambulanceId,
        updates,
        {
          new: true,
        }
      )
        .populate(
          'emt',
          'firstName lastName phone'
        )
        .populate(
          'driver',
          'firstName lastName phone'
        );

    if (!ambulance) {
      return res.status(404).json({
        success: false,
        message: 'Ambulance not found',
      });
    }

    const io = req.app.get('io');

    if (io) {
      const admins = await User.find({
        role: {
          $in: ['admin', 'superadmin'],
        },
        isActive: true,
      }).select('_id');

      const payload = {
        ambulanceId: ambulance._id,
        id: ambulance._id,
        coordinates:
          ambulance.location.coordinates,
        status: ambulance.status,
        registrationNumber:
          ambulance.registrationNumber,
        lastPing: ambulance.lastPing,
      };

      admins.forEach((admin) => {
        io.to(`user_${admin._id}`).emit(
          'ambulance_location_update',
          payload
        );
      });
    }

    res.json({
      success: true,
      ambulance,
    });
  } catch (error) {
    next(error);
  }
};

/* =========================================================
   HOSPITALS
========================================================= */

const getHospitals = async (req, res, next) => {
  try {
    const {
      county,
      type,
      shaEmpanelled,
      page = 1,
      limit = 20,
    } = req.query;

    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);

    const limitNumber = Math.min(
      Math.max(parseInt(limit, 10) || 20, 1),
      100
    );

    const query = {};

    if (county) {
      query.county = {
        $regex: county,
        $options: 'i',
      };
    }

    if (type) {
      query.type = type;
    }

    if (shaEmpanelled !== undefined) {
      query.shaEmpanelled =
        shaEmpanelled === 'true';
    }

    const skip = (pageNumber - 1) * limitNumber;

    const [hospitals, total] =
      await Promise.all([
        Hospital.find(query)
          .sort({
            county: 1,
            name: 1,
          })
          .skip(skip)
          .limit(limitNumber),

        Hospital.countDocuments(query),
      ]);

    res.json({
      success: true,
      hospitals,
      total,
      page: pageNumber,
      pages: Math.ceil(total / limitNumber),
    });
  } catch (error) {
    next(error);
  }
};

const createHospital = async (
  req,
  res,
  next
) => {
  try {
    const hospital = await Hospital.create(
      req.body
    );

    res.status(201).json({
      success: true,
      hospital,
    });
  } catch (error) {
    next(error);
  }
};

const updateHospital = async (
  req,
  res,
  next
) => {
  try {
    const hospital =
      await Hospital.findByIdAndUpdate(
        req.params.id,
        req.body,
        {
          new: true,
          runValidators: true,
        }
      );

    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: 'Hospital not found',
      });
    }

    res.json({
      success: true,
      hospital,
    });
  } catch (error) {
    next(error);
  }
};

/* =========================================================
   MEMBERSHIPS
========================================================= */

const getMemberships = async (
  req,
  res,
  next
) => {
  try {
    const {
      status,
      type,
      page = 1,
      limit = 20,
    } = req.query;

    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);

    const limitNumber = Math.min(
      Math.max(parseInt(limit, 10) || 20, 1),
      100
    );

    const query = {};

    if (status) {
      query.status = status;
    }

    if (type) {
      query.type = type;
    }

    const skip = (pageNumber - 1) * limitNumber;

    const [
      memberships,
      total,
      stats,
      totalRevenueResult,
    ] = await Promise.all([
      Membership.find(query)
        .populate(
          'user',
          'firstName lastName email phone'
        )
        .sort({
          createdAt: -1,
        })
        .skip(skip)
        .limit(limitNumber),

      Membership.countDocuments(query),

      Membership.aggregate([
        {
          $group: {
            _id: '$type',
            count: {
              $sum: 1,
            },
            revenue: {
              $sum: '$annualFee',
            },
          },
        },
        {
          $sort: {
            revenue: -1,
          },
        },
      ]),

      Membership.aggregate([
        {
          $match: {
            status: 'active',
          },
        },
        {
          $group: {
            _id: null,
            total: {
              $sum: '$annualFee',
            },
          },
        },
      ]),
    ]);

    res.json({
      success: true,
      memberships,
      total,
      page: pageNumber,
      pages: Math.ceil(total / limitNumber),
      stats,
      totalRevenue:
        totalRevenueResult[0]?.total || 0,
    });
  } catch (error) {
    next(error);
  }
};

/* =========================================================
   SYSTEM HEALTH
========================================================= */

const getSystemHealth = async (
  req,
  res,
  next
) => {
  try {
    const dbStatus =
      mongoose.connection.readyState;

    const staleThreshold = new Date(
      Date.now() - 2 * 60 * 60 * 1000
    );

    const [
      totalAmbulances,
      availableAmbulances,
      activeEmergencies,
      staleEmergencies,
    ] = await Promise.all([
      Ambulance.countDocuments({
        isActive: true,
      }),

      Ambulance.countDocuments({
        isActive: true,
        status: 'available',
      }),

      Emergency.countDocuments({
        status: {
          $in: [
            'pending',
            'dispatched',
            'enroute',
            'on_scene',
            'transporting',
          ],
        },
      }),

      Emergency.countDocuments({
        status: 'dispatched',
        updatedAt: {
          $lt: staleThreshold,
        },
      }),
    ]);

    const fleetUtilization =
      totalAmbulances > 0
        ? Math.round(
            ((totalAmbulances -
              availableAmbulances) /
              totalAmbulances) *
              100
          )
        : 0;

    res.json({
      success: true,
      health: {
        database:
          dbStatus === 1
            ? 'healthy'
            : 'degraded',

        totalAmbulances,
        availableAmbulances,
        fleetUtilization,
        activeEmergencies,
        staleEmergencies,
        serverTime:
          new Date().toISOString(),
        uptime: process.uptime(),
      },
    });
  } catch (error) {
    next(error);
  }
};

/* =========================================================
   BROADCAST
========================================================= */

const broadcastMessage = async (
  req,
  res,
  next
) => {
  try {
    const {
      message,
      type = 'info',
      target = 'all',
    } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Message is required',
      });
    }

    const io = req.app.get('io');

    if (io) {
      const payload = {
        message,
        type,
        timestamp: new Date(),
      };

      if (target === 'all') {
        io.emit(
          'system_broadcast',
          payload
        );
      } else if (target === 'admin') {
        io.to('admin_room').emit(
          'system_broadcast',
          payload
        );
      }
    }

    res.json({
      success: true,
      message: 'Broadcast sent successfully',
    });
  } catch (error) {
    next(error);
  }
};

/* =========================================================
   EXPORT EMERGENCIES
========================================================= */

const exportEmergencies = async (
  req,
  res,
  next
) => {
  try {
    const {
      startDate,
      endDate,
      county,
      status,
    } = req.query;

    const query = {
      isDeleted: false,
    };

    if (status) {
      query.status = status;
    }

    if (county) {
      query['patientLocation.county'] =
        county;
    }

    if (startDate || endDate) {
      query.createdAt = {};

      if (startDate) {
        query.createdAt.$gte =
          new Date(startDate);
      }

      if (endDate) {
        const end = new Date(endDate);

        end.setHours(
          23,
          59,
          59,
          999
        );

        query.createdAt.$lte = end;
      }
    }

    const emergencies =
      await Emergency.find(query)
        .populate(
          'patient',
          'firstName lastName phone idNumber shaNumber'
        )
        .populate(
          'emt',
          'firstName lastName'
        )
        .populate(
          'hospital',
          'name'
        )
        .sort({
          createdAt: -1,
        })
        .limit(5000);

    const exportData =
      emergencies.map((emergency) => ({
        id: emergency.emergencyId,
        date: emergency.createdAt
          ? emergency.createdAt.toISOString()
          : '',
        patient: emergency.patient
          ? `${emergency.patient.firstName || ''} ${emergency.patient.lastName || ''}`.trim()
          : '',
        phone:
          emergency.patient?.phone || '',
        type: emergency.type || '',
        severity:
          emergency.severity || '',
        status:
          emergency.status || '',
        county:
          emergency.patientLocation
            ?.county || '',
        emt: emergency.emt
          ? `${emergency.emt.firstName || ''} ${emergency.emt.lastName || ''}`.trim()
          : '',
        hospital:
          emergency.hospital?.name || '',
        responseTime:
          emergency.responseTime || '',
        totalTime:
          emergency.totalTime || '',
        shaVerified:
          emergency.shaVerified || false,
        rating:
          emergency.rating || '',
      }));

    res.json({
      success: true,
      data: exportData,
      count: exportData.length,
    });
  } catch (error) {
    next(error);
  }
};

/* =========================================================
   CREATE ADMIN
========================================================= */

const createAdmin = async (
  req,
  res,
  next
) => {
  try {
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message:
          'Only superadmins can create admin accounts',
      });
    }

    const {
      firstName,
      lastName,
      email,
      phone,
      password,
      address,
    } = req.body;

    if (
      !firstName ||
      !lastName ||
      !email ||
      !phone ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required',
      });
    }

    const normalizedEmail =
      email.toLowerCase().trim();

    const existing =
      await User.findOne({
        email: normalizedEmail,
      });

    if (existing) {
      return res.status(400).json({
        success: false,
        message:
          'An account with this email already exists',
      });
    }

    const hashedPassword =
      await bcrypt.hash(password, 12);

    const admin = await User.create({
      firstName,
      lastName,
      email: normalizedEmail,
      phone,
      password: hashedPassword,
      role: 'admin',
      address: address || {},
      isActive: true,
      isVerified: true,
    });

    res.status(201).json({
      success: true,
      message:
        'Admin account created successfully',
      user: {
        _id: admin._id,
        firstName: admin.firstName,
        lastName: admin.lastName,
        email: admin.email,
        phone: admin.phone,
        role: admin.role,
        isActive: admin.isActive,
        createdAt: admin.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

/* =========================================================
   DONATION STATS
========================================================= */

const getDonationStats = async (
  req,
  res,
  next
) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalDonations,
      completedDonations,
      processingDonations,
      pendingDonations,
      failedDonations,
      cancelledDonations,
      revenueResult,
      todayRevenueResult,
    ] = await Promise.all([
      Donation.countDocuments({}),

      Donation.countDocuments({
        status: 'completed',
      }),

      Donation.countDocuments({
        status: 'processing',
      }),

      Donation.countDocuments({
        status: 'pending',
      }),

      Donation.countDocuments({
        status: 'failed',
      }),

      Donation.countDocuments({
        status: 'cancelled',
      }),

      Donation.aggregate([
        {
          $match: {
            status: 'completed',
          },
        },
        {
          $group: {
            _id: null,
            total: {
              $sum: '$amount',
            },
          },
        },
      ]),

      Donation.aggregate([
        {
          $match: {
            status: 'completed',
            createdAt: {
              $gte: today,
            },
          },
        },
        {
          $group: {
            _id: null,
            total: {
              $sum: '$amount',
            },
          },
        },
      ]),
    ]);

    res.json({
      success: true,
      stats: {
        totalDonations,
        completedDonations,
        processingDonations,
        pendingDonations,
        failedDonations,
        cancelledDonations,
        totalRevenue:
          revenueResult[0]?.total || 0,
        todayRevenue:
          todayRevenueResult[0]?.total || 0,
      },
    });
  } catch (error) {
    next(error);
  }
};

/* =========================================================
   ALL DONATIONS
========================================================= */

const getAllDonations = async (
  req,
  res,
  next
) => {
  try {
    const {
      status,
      paymentMethod,
      search,
      page = 1,
      limit = 20,
      startDate,
      endDate,
    } = req.query;

    const pageNumber = Math.max(
      parseInt(page, 10) || 1,
      1
    );

    const limitNumber = Math.min(
      Math.max(
        parseInt(limit, 10) || 20,
        1
      ),
      100
    );

    const query = {};

    if (status) {
      query.status = status;
    }

    if (paymentMethod) {
      query.paymentMethod =
        paymentMethod;
    }

    if (search) {
      query.$or = [
        {
          donorName: {
            $regex: search,
            $options: 'i',
          },
        },
        {
          email: {
            $regex: search,
            $options: 'i',
          },
        },
        {
          phone: {
            $regex: search,
            $options: 'i',
          },
        },
        {
          paymentReference: {
            $regex: search,
            $options: 'i',
          },
        },
        {
          mpesaReceiptNumber: {
            $regex: search,
            $options: 'i',
          },
        },
        {
          kcbReference: {
            $regex: search,
            $options: 'i',
          },
        },
        {
          airtelReference: {
            $regex: search,
            $options: 'i',
          },
        },
        {
          bankReference: {
            $regex: search,
            $options: 'i',
          },
        },
      ];
    }

    if (startDate || endDate) {
      query.createdAt = {};

      if (startDate) {
        query.createdAt.$gte =
          new Date(startDate);
      }

      if (endDate) {
        const end = new Date(endDate);

        end.setHours(
          23,
          59,
          59,
          999
        );

        query.createdAt.$lte = end;
      }
    }

    const skip =
      (pageNumber - 1) *
      limitNumber;

    const [
      donations,
      total,
    ] = await Promise.all([
      Donation.find(query)
        .select(
          '-callbackData -providerResponse'
        )
        .sort({
          createdAt: -1,
        })
        .skip(skip)
        .limit(limitNumber),

      Donation.countDocuments(query),
    ]);

    const formattedDonations =
      donations.map((donation) => ({
        id: donation._id,

        donorName:
          donation.donorName || 'Anonymous',

        email:
          donation.email || '',

        phone:
          donation.phone || '',

        amount:
          donation.amount || 0,

        purpose:
          donation.purpose || '',

        paymentMethod:
          donation.paymentMethod || '',

        status:
          donation.status || 'unknown',

        reference:
          donation.kcbReference ||
          donation.airtelReference ||
          donation.mpesaReceiptNumber ||
          donation.bankReference ||
          donation.checkoutRequestId ||
          donation.paymentReference ||
          String(donation._id),

        mpesaReceiptNumber:
          donation.mpesaReceiptNumber || '',

        kcbReference:
          donation.kcbReference || '',

        airtelReference:
          donation.airtelReference || '',

        bankReference:
          donation.bankReference || '',

        callbackReceived:
          donation.callbackReceived || false,

        resultDescription:
          donation.resultDescription || '',

        createdAt:
          donation.createdAt,

        updatedAt:
          donation.updatedAt,
      }));

    res.json({
      success: true,
      donations: formattedDonations,
      total,
      page: pageNumber,
      pages: Math.ceil(
        total / limitNumber
      ),
    });
  } catch (error) {
    next(error);
  }
};

/* =========================================================
   SINGLE DONATION
========================================================= */

const getAdminDonation = async (
  req,
  res,
  next
) => {
  try {
    const donation =
      await Donation.findById(
        req.params.id
      ).select(
        '-callbackData -providerResponse'
      );

    if (!donation) {
      return res.status(404).json({
        success: false,
        message: 'Donation not found',
      });
    }

    res.json({
      success: true,
      donation,
    });
  } catch (error) {
    next(error);
  }
};

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  // Dashboard
  getDashboardStats,

  // Users
  getAllUsers,
  getSingleUser,
  updateUser,
  deleteUser,
  createAdmin,

  // Emergencies
  getAllEmergencies,
  getAdminEmergency,
  reassignAmbulance,
  exportEmergencies,

  // Ambulances
  getAmbulanceFleet,
  createAmbulance,
  updateAmbulanceLocation,

  // Hospitals
  getHospitals,
  createHospital,
  updateHospital,

  // Memberships
  getMemberships,

  // System
  getSystemHealth,
  broadcastMessage,

  // Donations
  getDonationStats,
  getAllDonations,
  getAdminDonation,
};