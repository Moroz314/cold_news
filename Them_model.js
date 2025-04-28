import mongoose from 'mongoose';

const UserThemeSchema = new mongoose.Schema({
  telegramId: {
    type: Number,
    required: true,
    unique: true
  },
  themes: {
    type: [String],
    default: []
  },
  channles: {
    type: [String],
    default: []
  },
}, { timestamps: true });

// Метод для добавления темы
UserThemeSchema.methods.addTheme = function(theme) {
  if (!this.themes.includes(theme)) {
    this.themes.push(theme);
  }
  return this.save();
};

UserThemeSchema.methods.addChannl = function(chanl) {
  if (!this.channles.includes(chanl)) {
    this.channles.push(chanl);
  }
  return this.save();
};

// Метод для удаления темы
UserThemeSchema.methods.removeTheme = function(theme) {
  this.themes = this.themes.filter(t => t !== theme);
  return this.save();
};


UserThemeSchema.methods.removeChannl = function(chanl) {
  this.channles = this.channles.filter(t => t !== chanl);
  return this.save();
};

export default mongoose.model('UserTheme', UserThemeSchema);