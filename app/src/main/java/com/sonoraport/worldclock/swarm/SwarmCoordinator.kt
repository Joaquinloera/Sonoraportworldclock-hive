package com.sonoraport.worldclock.swarm

import android.content.Context

class SwarmCoordinator(
    private val context: Context
) {
    private val skimmingEngine = SkimmingEngine(context)

    fun initialize() {
        skimmingEngine.initialize()
    }
}
