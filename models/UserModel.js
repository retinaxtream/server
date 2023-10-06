import mongoose from "mongoose";
import bcrypt from "bcryptjs";


const userSchema = mongoose.Schema(
    {
      mobile: { type: String, unique: true, sparse: true },
      email: { type: String, unique: true, sparse: true },
      password: { type: String, required: true },
      tokenVersion: {
        type: Number,
        default: 0,
      },
      otp: { type: String },
      createdotpAt: { type: Date },
      expiresotpAt: { type: Date },
      validating: { type: Boolean },
      banks: { type: Array },
      budget: { type: budgetSchema },
      budgetvariable: { type: budgetSchemav },
      totalfixedexpense: { type: Number },
      totalvariablexpense: { type: Number },
      refreshToken: { type: String },
      token: { type: tokenSchema },
      historyId: { type: String },
      messageId: { type: Array },
      income: { type: Number },
      totalExpense: { type: budgetTotal },
      budgetObject: { type: Object },
      setbudgets : {type : setbudget},
      totalFinalPostionIncome : {type: tfpIncome},
      totalFinalPostionExpenses : {type: tfpExpenses},
      totalFinalPostionAssets : {type: tfpAssets},
      totalFinalPostionLabilities :{type:tfpLabailites},
      totalFinalPostionGoals: {type:tfpGoals},
      totalFinalPostionTotal :{type:tfpTotal},
      bankError :{type: Bankerror},
      bankProgressStart:{type:Date},
      bankProgressEnd:{type:Date},
      achivegoals:{type: Object}
    },
    {
      timestamps: true,
    }
  );

  

  userSchema.methods.matchPassword = async function (enterPassword) {
    return await bcrypt.compare(enterPassword, this.password);
  };
  
  
  userSchema.pre("save", async function (next) {
    if (!this.isModified("password")) {
      return next();
    }
    try {
      const salt = await bcrypt.genSalt(10);
      this.password = await bcrypt.hash(this.password, salt);
      return next();
    } catch (error) {
      return next(error);
    }
  });
  
  const User = mongoose.model("user", userSchema);
  export default User;