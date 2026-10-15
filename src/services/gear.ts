import { database } from "../storage/database";
import { GearRepository } from "./gear-repository";
export const gearRepository = new GearRepository(database);
