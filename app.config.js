// Portable signing: each installer uses their own Apple team.
module.exports = ({ config }) => {
  const { appleTeamId: _localTeam, ...ios } = config.ios ?? {};
  const team = process.env.RIVL_APPLE_TEAM_ID;
  return { ...config, ios: { ...ios, ...(team ? { appleTeamId: team } : {}) } };
};
