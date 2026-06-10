const User = require('../models/User');
const Emergency = require('../models/Emergency');
const Ambulance = require('../models/Ambulance');
const Hospital = require('../models/Hospital');
const Membership = require('../models/Membership');

const getDashboardStats = async (req, res, next) => {
  try {
    const today = new Date(); today.setHours(0,0,0,0);
    const weekAgo = new Date(Date.now() - 7*24*60*60*1000);
    const monthAgo = new Date(Date.now() - 30*24*60*60*1000);

    const [totalUsers,totalEmergencies,activeAmbulances,todayEmergencies,activeMembers,pendingEmergencies,completedToday,criticalActive,weekEmergencies,monthEmergencies] = await Promise.all([
      User.countDocuments({role:'patient',isActive:true}),
      Emergency.countDocuments({isDeleted:false}),
      Ambulance.countDocuments({status:'available',isActive:true}),
      Emergency.countDocuments({createdAt:{$gte:today}}),
      Membership.countDocuments({status:'active'}),
      Emergency.countDocuments({status:{$in:['pending','dispatched','enroute','on_scene','transporting']}}),
      Emergency.countDocuments({status:'completed',createdAt:{$gte:today}}),
      Emergency.countDocuments({severity:'critical',status:{$nin:['completed','cancelled']}}),
      Emergency.countDocuments({createdAt:{$gte:weekAgo}}),
      Emergency.countDocuments({createdAt:{$gte:monthAgo}})
    ]);

    const sixMonthsAgo = new Date(); sixMonthsAgo.setMonth(sixMonthsAgo.getMonth()-6);
    const [monthlyTrend,typeBreakdown,countyStats,severityBreakdown,avgResponse,shaClaims] = await Promise.all([
      Emergency.aggregate([{$match:{createdAt:{$gte:sixMonthsAgo}}},{$group:{_id:{month:{$month:'$createdAt'},year:{$year:'$createdAt'}},count:{$sum:1}}},{$sort:{'_id.year':1,'_id.month':1}}]),
      Emergency.aggregate([{$group:{_id:'$type',count:{$sum:1}}},{$sort:{count:-1}}]),
      Emergency.aggregate([{$match:{'patientLocation.county':{$exists:true,$ne:''}}},{$group:{_id:'$patientLocation.county',count:{$sum:1}}},{$sort:{count:-1}},{$limit:10}]),
      Emergency.aggregate([{$group:{_id:'$severity',count:{$sum:1}}}]),
      Emergency.aggregate([{$match:{responseTime:{$exists:true,$gt:0}}},{$group:{_id:null,avgTime:{$avg:'$responseTime'}}}]),
      Emergency.aggregate([{$match:{shaVerified:true}},{$group:{_id:'$shaClaimStatus',count:{$sum:1}}}])
    ]);

    res.json({success:true,stats:{totalUsers,totalEmergencies,activeAmbulances,todayEmergencies,activeMembers,pendingEmergencies,completedToday,criticalActive,weekEmergencies,monthEmergencies,avgResponseTime:avgResponse[0]?Math.round(avgResponse[0].avgTime):0},monthlyTrend,typeBreakdown,countyStats,severityBreakdown,shaClaims});
  } catch(error){next(error);}
};

const getAllUsers = async (req,res,next) => {
  try {
    const {role,page=1,limit=20,search,isActive,county}=req.query;
    const query={};
    if(role) query.role=role;
    if(isActive!==undefined) query.isActive=isActive==='true';
    if(county) query['address.county']=county;
    if(search) query.$or=[{firstName:{$regex:search,$options:'i'}},{lastName:{$regex:search,$options:'i'}},{email:{$regex:search,$options:'i'}},{phone:{$regex:search,$options:'i'}}];
    const [users,total]=await Promise.all([
      User.find(query).select('-password -refreshToken -resetPasswordToken').sort({createdAt:-1}).skip((page-1)*limit).limit(parseInt(limit)),
      User.countDocuments(query)
    ]);
    res.json({success:true,users,total,page:parseInt(page),pages:Math.ceil(total/limit)});
  } catch(error){next(error);}
};

const getSingleUser = async (req,res,next) => {
  try {
    const user=await User.findById(req.params.id).select('-password -refreshToken');
    if(!user) return res.status(404).json({success:false,message:'User not found'});
    const [emergencies,membership]=await Promise.all([
      Emergency.find({patient:req.params.id}).sort({createdAt:-1}).limit(10),
      Membership.findOne({user:req.params.id,status:'active'})
    ]);
    res.json({success:true,user,emergencies,membership});
  } catch(error){next(error);}
};

const updateUser = async (req,res,next) => {
  try {
    const allowed=['role','isActive','isVerified'];
    const updates={};
    allowed.forEach(f=>{if(req.body[f]!==undefined) updates[f]=req.body[f];});
    const user=await User.findByIdAndUpdate(req.params.id,updates,{new:true,runValidators:true}).select('-password');
    if(!user) return res.status(404).json({success:false,message:'User not found'});
    res.json({success:true,message:'User updated',user});
  } catch(error){next(error);}
};

const deleteUser = async (req,res,next) => {
  try {
    const user=await User.findByIdAndUpdate(req.params.id,{isActive:false},{new:true});
    if(!user) return res.status(404).json({success:false,message:'User not found'});
    res.json({success:true,message:'User deactivated'});
  } catch(error){next(error);}
};

const getAllEmergencies = async (req,res,next) => {
  try {
    const {status,severity,county,type,page=1,limit=20,startDate,endDate}=req.query;
    const query={isDeleted:false};
    if(status) query.status=status;
    if(severity) query.severity=severity;
    if(type) query.type=type;
    if(county) query['patientLocation.county']={$regex:county,$options:'i'};
    if(startDate||endDate){query.createdAt={};if(startDate) query.createdAt.$gte=new Date(startDate);if(endDate) query.createdAt.$lte=new Date(endDate);}
    const [emergencies,total]=await Promise.all([
      Emergency.find(query).populate('patient','firstName lastName phone shaNumber').populate('emt','firstName lastName').populate('ambulance','registrationNumber type').populate('hospital','name').sort({createdAt:-1}).skip((page-1)*limit).limit(parseInt(limit)),
      Emergency.countDocuments(query)
    ]);
    res.json({success:true,emergencies,total,page:parseInt(page),pages:Math.ceil(total/limit)});
  } catch(error){next(error);}
};

const getAdminEmergency = async (req,res,next) => {
  try {
    const emergency=await Emergency.findById(req.params.id).populate('patient','firstName lastName phone email bloodGroup allergies medicalConditions shaNumber idNumber emergencyContacts').populate('emt','firstName lastName phone').populate('ambulance').populate('hospital');
    if(!emergency) return res.status(404).json({success:false,message:'Emergency not found'});
    res.json({success:true,emergency});
  } catch(error){next(error);}
};

const reassignAmbulance = async (req,res,next) => {
  try {
    const {ambulanceId}=req.body;
    const emergency=await Emergency.findById(req.params.id);
    if(!emergency) return res.status(404).json({success:false,message:'Emergency not found'});
    const ambulance=await Ambulance.findById(ambulanceId);
    if(!ambulance) return res.status(404).json({success:false,message:'Ambulance not found'});
    if(emergency.ambulance) await Ambulance.findByIdAndUpdate(emergency.ambulance,{status:'available'});
    emergency.ambulance=ambulanceId;
    emergency.emt=ambulance.emt;
    emergency.timeline.push({status:emergency.status,note:`Ambulance reassigned by admin to ${ambulance.registrationNumber}`});
    await emergency.save();
    await Ambulance.findByIdAndUpdate(ambulanceId,{status:'dispatched'});
    const io=req.app.get('io');
    if(io) io.to(`emergency_${emergency._id}`).emit('ambulance_reassigned',{registration:ambulance.registrationNumber});
    res.json({success:true,message:'Ambulance reassigned',emergency});
  } catch(error){next(error);}
};

const getAmbulanceFleet = async (req,res,next) => {
  try {
    const {county,status,type}=req.query;
    const query={isActive:true};
    if(county) query.county=county;
    if(status) query.status=status;
    if(type) query.type=type;
    const [ambulances,stats,statsByCounty]=await Promise.all([
      Ambulance.find(query).populate('driver','firstName lastName phone').populate('emt','firstName lastName phone').select('+location +lastPing').sort({status:1,county:1}),
      Ambulance.aggregate([{$match:{isActive:true}},{$group:{_id:'$status',count:{$sum:1}}}]),
      Ambulance.aggregate([{$match:{isActive:true}},{$group:{_id:{county:'$county',status:'$status'},count:{$sum:1}}},{$sort:{'_id.county':1}}])
    ]);
    res.json({success:true,ambulances,stats,statsByCounty});
  } catch(error){next(error);}
};

const getHospitals = async (req,res,next) => {
  try {
    const {county,type,shaEmpanelled,page=1,limit=20}=req.query;
    const query={};
    if(county) query.county={$regex:county,$options:'i'};
    if(type) query.type=type;
    if(shaEmpanelled!==undefined) query.shaEmpanelled=shaEmpanelled==='true';
    const [hospitals,total]=await Promise.all([
      Hospital.find(query).sort({county:1,name:1}).skip((page-1)*limit).limit(parseInt(limit)),
      Hospital.countDocuments(query)
    ]);
    res.json({success:true,hospitals,total,pages:Math.ceil(total/limit)});
  } catch(error){next(error);}
};

const createHospital = async (req,res,next) => {
  try {
    const hospital=await Hospital.create(req.body);
    res.status(201).json({success:true,hospital});
  } catch(error){next(error);}
};

const updateHospital = async (req,res,next) => {
  try {
    const hospital=await Hospital.findByIdAndUpdate(req.params.id,req.body,{new:true,runValidators:true});
    if(!hospital) return res.status(404).json({success:false,message:'Hospital not found'});
    res.json({success:true,hospital});
  } catch(error){next(error);}
};

const getMemberships = async (req,res,next) => {
  try {
    const {status,type,page=1,limit=20}=req.query;
    const query={};
    if(status) query.status=status;
    if(type) query.type=type;
    const [memberships,total,stats,totalRevenueResult]=await Promise.all([
      Membership.find(query).populate('user','firstName lastName email phone').sort({createdAt:-1}).skip((page-1)*limit).limit(parseInt(limit)),
      Membership.countDocuments(query),
      Membership.aggregate([{$group:{_id:'$type',count:{$sum:1},revenue:{$sum:'$annualFee'}}},{$sort:{revenue:-1}}]),
      Membership.aggregate([{$match:{status:'active'}},{$group:{_id:null,total:{$sum:'$annualFee'}}}])
    ]);
    res.json({success:true,memberships,total,pages:Math.ceil(total/limit),stats,totalRevenue:totalRevenueResult[0]?.total||0});
  } catch(error){next(error);}
};

const getSystemHealth = async (req,res,next) => {
  try {
    const mongoose=require('mongoose');
    const dbStatus=mongoose.connection.readyState;
    const staleThreshold=new Date(Date.now()-2*60*60*1000);
    const [totalAmb,availAmb,activeEmergencies,staleEmergencies]=await Promise.all([
      Ambulance.countDocuments({isActive:true}),
      Ambulance.countDocuments({status:'available',isActive:true}),
      Emergency.countDocuments({status:{$in:['pending','dispatched','enroute','on_scene','transporting']}}),
      Emergency.countDocuments({status:'dispatched',updatedAt:{$lt:staleThreshold}})
    ]);
    res.json({success:true,health:{database:dbStatus===1?'healthy':'degraded',totalAmbulances:totalAmb,availableAmbulances:availAmb,fleetUtilization:totalAmb>0?Math.round(((totalAmb-availAmb)/totalAmb)*100):0,activeEmergencies,staleEmergencies,serverTime:new Date().toISOString(),uptime:process.uptime()}});
  } catch(error){next(error);}
};

const broadcastMessage = async (req,res,next) => {
  try {
    const {message,type='info',target='all'}=req.body;
    const io=req.app.get('io');
    if(io){
      const payload={message,type,timestamp:new Date()};
      if(target==='all') io.emit('system_broadcast',payload);
      else if(target==='admin') io.to('admin_room').emit('system_broadcast',payload);
    }
    res.json({success:true,message:'Broadcast sent'});
  } catch(error){next(error);}
};

const exportEmergencies = async (req,res,next) => {
  try {
    const {startDate,endDate,county,status}=req.query;
    const query={isDeleted:false};
    if(status) query.status=status;
    if(county) query['patientLocation.county']=county;
    if(startDate||endDate){query.createdAt={};if(startDate)query.createdAt.$gte=new Date(startDate);if(endDate)query.createdAt.$lte=new Date(endDate);}
    const emergencies=await Emergency.find(query).populate('patient','firstName lastName phone idNumber shaNumber').populate('emt','firstName lastName').populate('hospital','name').sort({createdAt:-1}).limit(5000);
    const exportData=emergencies.map(e=>({id:e.emergencyId,date:e.createdAt.toISOString(),patient:`${e.patient?.firstName} ${e.patient?.lastName}`,phone:e.patient?.phone,type:e.type,severity:e.severity,status:e.status,county:e.patientLocation?.county,emt:e.emt?`${e.emt.firstName} ${e.emt.lastName}`:'',hospital:e.hospital?.name||'',responseTime:e.responseTime||'',totalTime:e.totalTime||'',shaVerified:e.shaVerified,rating:e.rating||''}));
    res.json({success:true,data:exportData,count:exportData.length});
  } catch(error){next(error);}
};

const createAdmin = async (req, res, next) => {
  try {
    // Only superadmin can create admins
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ success: false, message: 'Only superadmins can create admin accounts' });
    }

    const { firstName, lastName, email, phone, password, address } = req.body;

    if (!firstName || !lastName || !email || !phone || !password) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    // Check if email already exists
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(400).json({ success: false, message: 'An account with this email already exists' });
    }

    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(password, 12);

    const admin = await User.create({
      firstName,
      lastName,
      email: email.toLowerCase(),
      phone,
      password: hashedPassword,
      role: 'admin',
      address: address || {},
      isActive: true,
      isVerified: true, // Admin accounts are pre-verified
    });

    res.status(201).json({
      success: true,
      message: 'Admin account created successfully',
      user: {
        _id: admin._id,
        firstName: admin.firstName,
        lastName: admin.lastName,
        email: admin.email,
        phone: admin.phone,
        role: admin.role,
        isActive: admin.isActive,
        createdAt: admin.createdAt,
      }
    });
  } catch (error) { next(error); }
};

const createAmbulance = async (req, res, next) => {
  try {
    const { registrationNumber, type, county, status, emt, driver, equipment, capacity, notes } = req.body;

    if (!registrationNumber || !type || !county) {
      return res.status(400).json({ success: false, message: 'Registration number, type and county are required' });
    }

    const existing = await Ambulance.findOne({ registrationNumber: registrationNumber.toUpperCase() });
    if (existing) {
      return res.status(400).json({ success: false, message: 'An ambulance with this registration already exists' });
    }

    const ambulance = await Ambulance.create({
      registrationNumber: registrationNumber.toUpperCase(),
      type,
      county,
      status: status || 'available',
      emt: emt || null,
      driver: driver || null,
      equipment: equipment || [],
      capacity: capacity || 2,
      notes: notes || '',
      isActive: true,
      location: { type: 'Point', coordinates: [0, 0] }
    });

    const populated = await Ambulance.findById(ambulance._id)
      .populate('emt', 'firstName lastName phone')
      .populate('driver', 'firstName lastName phone');

    res.status(201).json({ success: true, message: 'Ambulance created successfully', ambulance: populated });
  } catch (error) { next(error); }
};

const updateAmbulanceLocation = async (req, res, next) => {
  try {
    const { coordinates, status } = req.body;

    if (!req.params.id || req.params.id === 'undefined') {
      return res.status(400).json({ success: false, message: 'Ambulance ID is missing. Make sure ambulanceId is set on the EMT user account.' });
    }

    if (!coordinates || !Array.isArray(coordinates) || coordinates.length !== 2) {
      return res.status(400).json({ success: false, message: 'coordinates must be [longitude, latitude]' });
    }

    const updates = { lastPing: new Date() };
    if (coordinates) updates.location = { type: 'Point', coordinates };
    if (status) updates.status = status;

    const ambulance = await Ambulance.findByIdAndUpdate(req.params.id, updates, { new: true })
      .populate('emt', 'firstName lastName phone')
      .populate('driver', 'firstName lastName phone');

    if (!ambulance) return res.status(404).json({ success: false, message: 'Ambulance not found' });

    const io = req.app.get('io');
    if (io) {
      // Find all admin/superadmin user IDs and emit to each of their rooms
      const User = require('../models/User');
      const admins = await User.find({ role: { $in: ['admin', 'superadmin'] }, isActive: true }).select('_id');
      const payload = {
        ambulanceId: ambulance._id,   // frontend uses ambulanceId (was 'id' — bug fixed)
        id: ambulance._id,            // keep for backwards compat
        coordinates: ambulance.location.coordinates,
        status: ambulance.status,
        registrationNumber: ambulance.registrationNumber,
        lastPing: ambulance.lastPing
      };
      admins.forEach(admin => {
        io.to(`user_${admin._id}`).emit('ambulance_location_update', payload);
      });
    }

    res.json({ success: true, ambulance });
  } catch (error) { next(error); }
};

module.exports = {getDashboardStats,getAllUsers,getSingleUser,updateUser,deleteUser,getAllEmergencies,getAdminEmergency,reassignAmbulance,getAmbulanceFleet,getHospitals,createHospital,updateHospital,getMemberships,getSystemHealth,broadcastMessage,exportEmergencies,createAdmin,createAmbulance,updateAmbulanceLocation};
